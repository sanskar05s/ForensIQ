import os
import json
import logging
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

from jinja2 import Environment, FileSystemLoader
from xhtml2pdf import pisa
import google.generativeai as genai
from app.services.lead_generator import generate_investigation_leads
from app.services.evidence_scorer import compute_priority_score

logger = logging.getLogger(__name__)

TEMPLATE_DIR = str(Path(__file__).parent)


def _call_gemini(prompt: str) -> str:
    """Calls Gemini with a prompt. Returns text or fallback string."""
    try:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            return "AI content unavailable — GEMINI_API_KEY not configured."
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-3.1-flash-lite")
        response = model.generate_content(prompt)
        return response.text
    except Exception as e:
        logger.warning(f"Gemini call failed in report builder: {e}")
        return "AI content temporarily unavailable. Please review evidence manually."


def _parse_next_steps(text: str) -> list:
    """Parses Gemini bullet list into a Python list."""
    lines = []
    for line in text.split('\n'):
        line = line.strip()
        if line and len(line) > 5:
            # Strip common bullet prefixes
            for prefix in ['- ', '• ', '* ', '1. ', '2. ', '3. ',
                           '4. ', '5. ']:
                if line.startswith(prefix):
                    line = line[len(prefix):]
            lines.append(line)
    return lines[:5] if lines else [text[:500]]


def generate_report(case_id: str, supabase) -> str:
    """
    Assembles all case data, generates Gemini sections, renders PDF.
    Returns the Supabase Storage path of the uploaded PDF.
    Raises on critical failure after setting status = 'failed'.
    """
    # Mark as generating
    supabase.table("reports").upsert(
        {"case_id": case_id, "status": "generating"},
        on_conflict="case_id"
    ).execute()

    try:
        # ── Fetch all data ─────────────────────────────────────────────
        case = supabase.table("cases").select("*")\
            .eq("id", case_id).single().execute().data or {}

        evidence_list = supabase.table("evidence").select("*")\
            .eq("case_id", case_id)\
            .order("uploaded_at", desc=False)\
            .execute().data or []

        statements = supabase.table("witness_statements").select("*")\
            .eq("case_id", case_id).execute().data or []

        contradictions = supabase.table("contradictions")\
            .select("*, "
                    "witness_a:witness_a_id(witness_label), "
                    "witness_b:witness_b_id(witness_label)")\
            .eq("case_id", case_id)\
            .order("severity", desc=True)\
            .execute().data or []

        timeline_events = supabase.table("timeline_events")\
            .select("*").eq("case_id", case_id)\
            .order("relative_order", desc=False)\
            .execute().data or []

        # ── New Feature Data ──────────────────────────────────────────────

        # Section 9: Investigation Leads
        leads_data = {"leads": [], "summary": ""}
        try:
            leads_data = generate_investigation_leads(case_id, supabase)
        except Exception as e:
            logger.warning(f"Lead generation failed for report (non-fatal): {e}")

        # Section 10: Evidence Priority (sort existing evidence by score)
        # Fetch contradictions and KG nodes for scoring
        report_contradictions = supabase.table("contradictions")\
            .select("claim_a, claim_b")\
            .eq("case_id", case_id)\
            .execute().data or []

        report_kg = supabase.table("knowledge_graphs")\
            .select("nodes")\
            .eq("case_id", case_id)\
            .execute()
        report_kg_nodes = (report_kg.data[0].get("nodes") or []) \
            if report_kg.data else []

        # Score every evidence item
        scored_evidence = []
        for ev in evidence_list:
            try:
                score_data = compute_priority_score(
                    ev, report_contradictions, report_kg_nodes
                )
                scored_evidence.append({**ev, **score_data})
            except Exception:
                scored_evidence.append({
                    **ev,
                    "score": 0,
                    "priority": "LOW",
                    "priority_breakdown": {}
                })

        # Sort: CRITICAL first, then HIGH, MEDIUM, LOW
        priority_order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
        scored_evidence.sort(
            key=lambda e: (
                priority_order.get(e.get("priority", "LOW"), 3),
                -(e.get("score") or 0)
            )
        )

        # Section 11: Hypothesis Analysis
        hypotheses_data = []
        try:
            hyp_result = supabase.table("hypotheses")\
                .select("*")\
                .eq("case_id", case_id)\
                .order("confidence_score", desc=True)\
                .execute()
            hypotheses_data = hyp_result.data or []
        except Exception as e:
            logger.warning(f"Hypothesis fetch failed for report (non-fatal): {e}")

        # ── Gemini sections ───────────────────────────────────────────
        case_summary_json = json.dumps({
            "title": case.get("title"),
            "evidence_count": len(evidence_list),
            "witness_count": len(statements),
            "contradiction_count": len(contradictions),
            "timeline_events": len(timeline_events),
        })

        exec_summary = _call_gemini(
            f"Write a 2-3 sentence professional executive summary for this "
            f"investigation. Only use facts from this data. Never name suspects. "
            f"Keep it factual and concise: {case_summary_json}"
        )

        next_steps_text = _call_gemini(
            f"List 3-5 concrete next investigation steps based on the gaps and "
            f"contradictions in this case. Be specific. Format as bullet points "
            f"starting with '- '. Case data: {case_summary_json} "
            f"Contradictions found: {len(contradictions)}. "
            f"Evidence items: {len(evidence_list)}."
        )

        # ── Build template context ────────────────────────────────────
        now_str = datetime.now(timezone.utc).strftime("%d %b %Y %H:%M UTC")

        context = {
            "case": case,
            "evidence_list": evidence_list,
            "statements": statements,
            "contradictions": contradictions,
            "timeline_events": timeline_events,
            "blockchain_data": evidence_list,  # all evidence has hash fields
            "executive_summary": exec_summary,
            "ai_next_steps_list": _parse_next_steps(next_steps_text),
            "generated_at": now_str,
            "total_evidence": len(evidence_list),
            "total_statements": len(statements),
            "total_contradictions": len(contradictions),
            "total_events": len(timeline_events),
            "verified_count": sum(
                1 for e in evidence_list if e.get("blockchain_tx_hash")
            ),
            # New sections
            "leads_data":        leads_data,
            "scored_evidence":   scored_evidence,
            "hypotheses_data":   hypotheses_data,
            # Count for summary in section 2
            "lead_count":        len(leads_data.get("leads", [])),
            "hypothesis_count":  len(hypotheses_data),
            "critical_evidence": sum(
                1 for e in scored_evidence
                if e.get("priority") == "CRITICAL"
            ),
        }

        # ── Render HTML ───────────────────────────────────────────────
        env = Environment(loader=FileSystemLoader(TEMPLATE_DIR))
        template = env.get_template("template.html")
        html_content = template.render(**context)

        # ── Convert to PDF ────────────────────────────────────────────
        pdf_buffer = BytesIO()
        pisa_status = pisa.CreatePDF(
            html_content.encode('utf-8'),
            dest=pdf_buffer,
            encoding='utf-8'
        )
        if pisa_status.err:
            raise RuntimeError(
                f"PDF generation failed with {pisa_status.err} error(s)"
            )
        pdf_buffer.seek(0)
        pdf_bytes = pdf_buffer.read()

        # ── Upload to Supabase Storage ────────────────────────────────
        storage_path = f"cases/{case_id}/report.pdf"
        supabase.storage.from_("reports").upload(
            storage_path,
            pdf_bytes,
            {"content-type": "application/pdf", "upsert": "true"}
        )

        # ── Update reports table ──────────────────────────────────────
        sections_summary = {
            "executive_summary": exec_summary[:500],
            "evidence_count": len(evidence_list),
            "witness_count": len(statements),
            "contradiction_count": len(contradictions),
            "timeline_event_count": len(timeline_events),
            "blockchain_verified_count": context["verified_count"],
            "lead_count":        len(leads_data.get("leads", [])),
            "hypothesis_count":  len(hypotheses_data),
            "critical_evidence": context["critical_evidence"],
        }

        supabase.table("reports").upsert({
            "case_id": case_id,
            "status": "ready",
            "storage_path": storage_path,
            "sections": sections_summary,
            "ai_next_steps": next_steps_text,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "error_message": None,
        }, on_conflict="case_id").execute()

        # Activity log
        try:
            from app.services.activity_logger import log_activity
            log_activity(
                case_id=case_id,
                event_type="report_generated",
                description="Investigation report generated and ready for download",
                metadata={"storage_path": storage_path}
            )
        except Exception:
            pass

        return storage_path

    except Exception as e:
        logger.error(f"Report generation failed for case {case_id}: {e}")
        import traceback
        logger.error(traceback.format_exc())
        supabase.table("reports").upsert({
            "case_id": case_id,
            "status": "failed",
            "error_message": str(e),
        }, on_conflict="case_id").execute()
        raise


def get_report_download_url(storage_path: str, supabase) -> str | None:
    """Generates a 1-hour signed URL for the report PDF."""
    try:
        result = supabase.storage.from_("reports")\
            .create_signed_url(storage_path, 3600)
        return result.get("signedURL")
    except Exception as e:
        logger.error(f"Failed to create signed URL: {e}")
        return None
