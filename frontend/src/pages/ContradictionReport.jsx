import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  GitMerge,
  X,
  ArrowLeftRight,
} from "lucide-react";

import AppShell from "../components/layout/AppShell";
import Spinner from "../components/loading/Spinner";
import SkeletonCard from "../components/loading/SkeletonCard";
import { apiClient, apiPatch } from "../api/client";

/* ─── Type badge colors ─── */

const TYPE_COLORS = {
  time: { bg: "rgba(168,85,247,0.12)", color: "#a855f7" },
  color: { bg: "rgba(249,115,22,0.12)", color: "#f97316" },
  quantity: { bg: "rgba(20,184,166,0.12)", color: "#14b8a6" },
  direction: { bg: "rgba(34,197,94,0.12)", color: "#22c55e" },
  nli: { bg: "rgba(59,130,246,0.12)", color: "#3b82f6" },
};

const SEVERITY_COLORS = {
  HIGH: "var(--danger)",
  MEDIUM: "var(--warning)",
  LOW: "var(--success)",
};

const STATUS_CONFIG = {
  unresolved: {
    label: "⚠ Unresolved",
    color: "#D97706",
    bg: "rgba(217,119,6,0.12)",
  },
  supported_by_evidence: {
    label: "✓ Supported by Evidence",
    color: "#059669",
    bg: "rgba(5,150,105,0.12)",
  },
  rejected: {
    label: "✗ Rejected",
    color: "#DC2626",
    bg: "rgba(220,38,38,0.12)",
  },
  insufficient_evidence: {
    label: "? Insufficient Evidence",
    color: "#6366F1",
    bg: "rgba(99,102,241,0.12)",
  },
  resolved: {
    label: "✓ Resolved",
    color: "#059669",
    bg: "rgba(5,150,105,0.12)",
  },
};

const DEFAULT_TYPE_COLOR = { bg: "rgba(156,163,175,0.12)", color: "#9ca3af" };

/* ─── Inline styles ─── */

const cardStyle = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  padding: "20px",
  marginBottom: "16px",
  position: "relative",
};

const quoteStyle = {
  background: "var(--bg-muted)",
  borderRadius: "var(--radius-sm)",
  padding: "12px 16px",
  fontStyle: "italic",
  fontSize: "13px",
  lineHeight: 1.6,
  color: "var(--text-secondary)",
};

const badgeBase = {
  display: "inline-block",
  padding: "3px 10px",
  borderRadius: "999px",
  fontSize: "10px",
  fontWeight: 700,
  letterSpacing: "0.5px",
  textTransform: "uppercase",
};

const monoStyle = {
  fontFamily: "'JetBrains Mono', monospace",
};

/* ─── Main component ─── */

export default function ContradictionReport() {
  const { caseId } = useParams();
  const navigate = useNavigate();

  const [contradictions, setContradictions] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState(null);
  const [runError, setRunError] = useState("");

  const [resolvingId, setResolvingId] = useState(null);

  useEffect(() => {
    fetchContradictions();
  }, [caseId]);

  async function fetchContradictions() {
    setListLoading(true);
    try {
      const res = await apiClient(`/contradiction/cases/${caseId}`);
      setContradictions(res.contradictions || []);
    } catch {
      setContradictions([]);
    } finally {
      setListLoading(false);
    }
  }

  async function handleRun() {
    setRunning(true);
    setRunResult(null);
    setRunError("");
    try {
      const res = await apiClient(`/contradiction/cases/${caseId}/run`, {
        method: "POST",
      });
      setRunResult(res);
      setTimeout(() => setRunResult(null), 5000);
      fetchContradictions();
    } catch (err) {
      setRunError(err.message || "Failed to run contradiction check.");
    } finally {
      setRunning(false);
    }
  }

  async function handleDismiss(contradictionId) {
    const confirmed = window.confirm(
      "Dismiss this contradiction? It will be removed from the report."
    );
    if (!confirmed) return;

    try {
      await apiClient(
        `/contradiction/cases/${caseId}/${contradictionId}`,
        { method: "DELETE" }
      );
      setContradictions((prev) =>
        prev.filter((c) => c.id !== contradictionId)
      );
    } catch {
      // silent
    }
  }

  async function resolveContradiction(contradictionId, status, reason) {
    setResolvingId(contradictionId);
    try {
      await apiPatch(
        `/contradiction/cases/${caseId}/${contradictionId}/resolve`,
        { resolution_status: status, resolution_reason: reason }
      );
      await fetchContradictions();
    } catch (err) {
      console.error("Failed to resolve contradiction:", err);
    } finally {
      setResolvingId(null);
    }
  }

  /* ─── Helpers ─── */

  function getWitnessLabel(c, side) {
    const nested = c[side];
    if (nested && typeof nested === "object" && nested.witness_label) {
      return nested.witness_label;
    }
    return side === "witness_a" ? "Witness A" : "Witness B";
  }

  function getTypeColor(type) {
    return TYPE_COLORS[type] || DEFAULT_TYPE_COLOR;
  }

  /* ─── Card renderer ─── */

  function renderContradictionCard(c) {
    const typeColor = getTypeColor(c.type);
    const severityColor = SEVERITY_COLORS[c.severity] || "var(--text-muted)";
    const labelA = getWitnessLabel(c, "witness_a");
    const labelB = getWitnessLabel(c, "witness_b");
    const status = c.resolution_status || "unresolved";
    const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG.unresolved;

    return (
      <div key={c.id} style={cardStyle}>
        {/* Top row badges */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "8px",
            alignItems: "center",
            marginBottom: "14px",
          }}
        >
          {/* Tier badge */}
          <span
            style={{
              ...badgeBase,
              background:
                c.tier === 1
                  ? "rgba(56,189,248,0.12)"
                  : "rgba(59,130,246,0.12)",
              color: c.tier === 1 ? "#38bdf8" : "var(--accent)",
            }}
          >
            {c.tier === 1 ? "RULE-BASED" : "AI DETECTED"}
          </span>

          {/* Type badge */}
          <span
            style={{
              ...badgeBase,
              background: typeColor.bg,
              color: typeColor.color,
            }}
          >
            {(c.type || "unknown").toUpperCase()}
          </span>

          {/* Severity badge */}
          <span
            style={{
              ...badgeBase,
              background: `${severityColor}1a`,
              color: severityColor,
            }}
          >
            {c.severity}
          </span>

          {/* Resolution status badge */}
          <span
            style={{
              padding: "2px 8px",
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 600,
              background: statusCfg.bg,
              color: statusCfg.color,
              border: `1px solid ${statusCfg.color}44`,
            }}
          >
            {statusCfg.label}
          </span>

          {/* Dismiss button */}
          <button
            onClick={() => handleDismiss(c.id)}
            style={{
              marginLeft: "auto",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
              padding: "4px",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.color = "var(--danger)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = "var(--text-muted)")
            }
          >
            <X size={16} />
          </button>
        </div>

        {/* Witness labels row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: "16px",
          }}
        >
          <span
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 600,
              fontSize: "15px",
            }}
          >
            {labelA}
          </span>
          <ArrowLeftRight
            size={16}
            color="var(--text-muted)"
          />
          <span
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 600,
              fontSize: "15px",
            }}
          >
            {labelB}
          </span>
        </div>

        {/* Claim comparison — two columns */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "16px",
            marginBottom: "16px",
          }}
        >
          <div>
            <p
              style={{
                fontSize: "12px",
                color: "var(--text-muted)",
                marginBottom: "6px",
                fontWeight: 500,
              }}
            >
              {labelA} states:
            </p>
            <div style={quoteStyle}>{c.claim_a}</div>
          </div>
          <div>
            <p
              style={{
                fontSize: "12px",
                color: "var(--text-muted)",
                marginBottom: "6px",
                fontWeight: 500,
              }}
            >
              {labelB} states:
            </p>
            <div style={quoteStyle}>{c.claim_b}</div>
          </div>
        </div>

        {/* XAI explanation */}
        <p
          style={{
            fontSize: "13px",
            fontStyle: "italic",
            color: "var(--text-secondary)",
            lineHeight: 1.6,
          }}
        >
          {c.xai_explanation}
        </p>

        {/* Confidence display — Tier 1 & Tier 2 */}
        {c.nli_confidence != null && (
          <div
            style={{
              marginTop: "10px",
              ...monoStyle,
              fontSize: "12px",
              color: severityColor,
            }}
          >
            {c.tier === 1 ? "Rule Confidence" : "NLI Confidence"}:{" "}
            {(c.nli_confidence * 100).toFixed(0)}%
          </div>
        )}

        {/* Resolution reason display */}
        {c.resolution_reason && (
          <div
            style={{
              marginTop: 12,
              padding: "8px 12px",
              background: statusCfg.bg || "rgba(0,0,0,0.06)",
              borderLeft: `3px solid ${statusCfg.color || "var(--border)"}`,
              borderRadius: "0 6px 6px 0",
              fontSize: 12,
              color: "var(--text-secondary)",
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                color: statusCfg.color,
                display: "block",
                marginBottom: 3,
              }}
            >
              Resolution
            </span>
            {c.resolution_reason}
            {c.resolved_by && (
              <span
                style={{
                  color: "var(--text-muted)",
                  fontSize: 10,
                  marginLeft: 6,
                }}
              >
                — {c.resolved_by}
              </span>
            )}
          </div>
        )}

        {/* Resolution action */}
        <div
          style={{
            marginTop: 14,
            paddingTop: 12,
            borderTop: "1px solid var(--border)",
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <span
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              fontWeight: 500,
              marginRight: 2,
            }}
          >
            Resolution:
          </span>
          {[
            { value: "unresolved", label: "⚠ Mark Unresolved" },
            { value: "supported_by_evidence", label: "✓ Supported by Evidence" },
            { value: "rejected", label: "✗ Reject" },
            { value: "insufficient_evidence", label: "? Insufficient Evidence" },
            { value: "resolved", label: "✓ Mark Resolved" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                const currentReason =
                  c.resolution_status === opt.value
                    ? c.resolution_reason || ""
                    : "";
                const reason = window.prompt(
                  `Optional reason for "${opt.label}":`,
                  currentReason
                );
                if (reason !== null) {
                  resolveContradiction(c.id, opt.value, reason.trim() || null);
                }
              }}
              disabled={resolvingId === c.id}
              style={{
                padding: "4px 10px",
                fontSize: 11,
                borderRadius: 5,
                cursor: resolvingId === c.id ? "not-allowed" : "pointer",
                background:
                  c.resolution_status === opt.value
                    ? STATUS_CONFIG[opt.value]?.bg
                    : "transparent",
                border: `1px solid ${STATUS_CONFIG[opt.value]?.color || "var(--border)"}`,
                color:
                  STATUS_CONFIG[opt.value]?.color || "var(--text-muted)",
                fontWeight: c.resolution_status === opt.value ? 700 : 400,
                opacity: resolvingId === c.id ? 0.6 : 1,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  /* ─── Render ─── */

  return (
    <AppShell>
      <div style={{ maxWidth: "860px", margin: "0 auto" }}>
        {/* Header */}
        <button
          onClick={() => navigate(`/cases/${caseId}`)}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--accent)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            marginBottom: "20px",
            fontSize: "14px",
          }}
        >
          <ArrowLeft size={16} />
          Back to Case
        </button>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginBottom: "20px",
          }}
        >
          <h1
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 700,
              fontSize: "28px",
              margin: 0,
            }}
          >
            Contradiction Report
          </h1>
          <span
            style={{
              fontSize: "13px",
              color: "var(--text-muted)",
              ...monoStyle,
            }}
          >
            {contradictions.length} found
          </span>
        </div>

        {/* Action row */}
        <div style={{ marginBottom: "24px" }}>
          <button
            onClick={handleRun}
            disabled={running}
            style={{
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: "var(--radius-sm)",
              padding: "10px 24px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: running ? "not-allowed" : "pointer",
              opacity: running ? 0.7 : 1,
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            {running && <Spinner size={14} />}
            {running ? "Analyzing statements..." : "Run Contradiction Check"}
          </button>

          {runResult && (
            <p
              style={{
                marginTop: "12px",
                fontSize: "13px",
                color: "var(--success)",
              }}
            >
              Found {runResult.new_contradictions} new contradiction(s) across{" "}
              {runResult.pairs_compared} statement pairs.
            </p>
          )}
          {runError && (
            <p
              style={{
                marginTop: "12px",
                fontSize: "13px",
                color: "var(--danger)",
              }}
            >
              {runError}
            </p>
          )}
        </div>

        {/* Contradictions list */}
        {listLoading && (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "12px" }}
          >
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {!listLoading && contradictions.length === 0 && (
          <div
            style={{
              textAlign: "center",
              padding: "60px 20px",
              color: "var(--text-muted)",
            }}
          >
            <GitMerge
              size={48}
              style={{ marginBottom: "16px", opacity: 0.5 }}
            />
            <p style={{ fontSize: "16px", marginBottom: "6px" }}>
              No contradictions detected yet.
            </p>
            <p
              style={{ fontSize: "13px", marginBottom: "20px" }}
            >
              Add witness statements and run the contradiction check.
            </p>
            <button
              onClick={handleRun}
              disabled={running}
              style={{
                background: "var(--accent)",
                color: "#fff",
                border: "none",
                borderRadius: "var(--radius-sm)",
                padding: "8px 20px",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              {running && <Spinner size={14} />}
              {running ? "Analyzing..." : "Run Contradiction Check"}
            </button>
          </div>
        )}

        {!listLoading &&
          contradictions.length > 0 &&
          contradictions.map((c) => renderContradictionCard(c))}
      </div>
    </AppShell>
  );
}
