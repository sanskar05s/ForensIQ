from fastapi import APIRouter
from app.core.supabase import get_supabase_client
from app.services.claim_linker import build_claim_links

router = APIRouter()


@router.post("/claims/cases/{case_id}/build")
async def build_links(case_id: str):
    supabase = get_supabase_client()
    links = build_claim_links(case_id, supabase)
    return {"links_created": len(links)}


@router.get("/claims/cases/{case_id}/evidence/{evidence_id}")
async def get_evidence_claims(case_id: str, evidence_id: str):
    supabase = get_supabase_client()
    result = supabase.table("evidence_claim_links")\
        .select("*, statement:statement_id(witness_label)")\
        .eq("evidence_id", evidence_id)\
        .order("confidence", desc=True).execute()
    return {"links": result.data or []}


@router.get("/claims/cases/{case_id}/statement/{statement_id}")
async def get_statement_evidence(case_id: str, statement_id: str):
    supabase = get_supabase_client()
    result = supabase.table("evidence_claim_links")\
        .select("*, evidence:evidence_id(filename, type)")\
        .eq("statement_id", statement_id)\
        .order("confidence", desc=True).execute()
    return {"links": result.data or []}
