import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Users,
  Trash2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

import AppShell from "../components/layout/AppShell";
import Spinner from "../components/loading/Spinner";
import SkeletonCard from "../components/loading/SkeletonCard";
import { apiClient } from "../api/client";
import { supabase } from "../supabase/client";
import { relativeTime } from "../utils/relativeTime";

/* ─── Entity type badge colors ─── */

const ENTITY_COLORS = {
  PERSON: { bg: "rgba(59,130,246,0.12)", color: "#3b82f6" },
  LOCATION: { bg: "rgba(34,197,94,0.12)", color: "#22c55e" },
  TIME: { bg: "rgba(168,85,247,0.12)", color: "#a855f7" },
  OBJECT: { bg: "rgba(249,115,22,0.12)", color: "#f97316" },
  EVENT: { bg: "rgba(20,184,166,0.12)", color: "#14b8a6" },
  ORGANIZATION: { bg: "rgba(236,72,153,0.12)", color: "#ec4899" },
};

const DEFAULT_ENTITY_COLOR = { bg: "rgba(156,163,175,0.12)", color: "#9ca3af" };

/* ─── Inline styles ─── */

const cardStyle = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  padding: "20px",
  marginBottom: "16px",
};

const monoStyle = {
  fontFamily: "'JetBrains Mono', monospace",
};

const labelStyle = {
  display: "block",
  marginBottom: "6px",
  fontSize: "13px",
  fontWeight: 500,
  color: "var(--text-secondary)",
};

const inputStyle = {
  width: "100%",
  padding: "10px 14px",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  background: "var(--bg-muted)",
  color: "var(--text-primary)",
  fontSize: "14px",
  outline: "none",
  boxSizing: "border-box",
};

/* ─── Main component ─── */

export default function WitnessStatements() {
  const { caseId } = useParams();
  const navigate = useNavigate();

  /* Form state */
  const [witnessLabel, setWitnessLabel] = useState("");
  const [rawText, setRawText] = useState("");
  const [sourceEvidenceId, setSourceEvidenceId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  /* Evidence dropdown */
  const [evidenceList, setEvidenceList] = useState([]);

  /* Statements list */
  const [statements, setStatements] = useState([]);
  const [listLoading, setListLoading] = useState(true);

  /* Expanded analysis panels */
  const [expandedAnalysis, setExpandedAnalysis] = useState({});

  useEffect(() => {
    fetchStatements();
    fetchEvidence();
  }, [caseId]);

  async function fetchStatements() {
    setListLoading(true);
    try {
      const res = await apiClient(`/witness/cases/${caseId}/statements`);
      setStatements(res.statements || []);
    } catch {
      setStatements([]);
    } finally {
      setListLoading(false);
    }
  }

  async function fetchEvidence() {
    try {
      const { data } = await supabase
        .from("evidence")
        .select("id, filename, uploaded_at")
        .eq("case_id", caseId)
        .order("uploaded_at", { ascending: false });
      setEvidenceList(data || []);
    } catch {
      setEvidenceList([]);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError("");
    setSuccessMsg("");

    if (!witnessLabel.trim()) {
      setFormError("Witness label is required.");
      return;
    }
    if (!rawText.trim()) {
      setFormError("Statement text cannot be empty.");
      return;
    }
    if (rawText.trim().length < 10) {
      setFormError("Statement is too short to analyze.");
      return;
    }

    setSubmitting(true);

    try {
      const body = {
        witness_label: witnessLabel,
        raw_text: rawText,
      };
      if (sourceEvidenceId) {
        body.source_evidence_id = sourceEvidenceId;
      }

      await apiClient(`/witness/cases/${caseId}/statements`, {
        method: "POST",
        body: JSON.stringify(body),
      });

      setWitnessLabel("");
      setRawText("");
      setSourceEvidenceId("");
      setSuccessMsg("Statement analyzed and saved.");
      setTimeout(() => setSuccessMsg(""), 3000);
      fetchStatements();
    } catch (err) {
      setFormError(err.message || "Failed to analyze statement.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(statementId) {
    const confirmed = window.confirm(
      "Delete this witness statement? This action cannot be undone."
    );
    if (!confirmed) return;

    try {
      await apiClient(
        `/witness/cases/${caseId}/statements/${statementId}`,
        { method: "DELETE" }
      );
      fetchStatements();
    } catch {
      // silent
    }
  }

  function toggleAnalysis(id) {
    setExpandedAnalysis((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  /* ─── Entity helpers ─── */

  function safeEntityList(raw) {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string") {
      try { const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed : []; }
      catch { return []; }
    }
    return [];
  }

  function getEntityTypeCounts(entities) {
    const safe = safeEntityList(entities);
    const counts = {};
    for (const ent of safe) {
      const t = ent.type || "UNKNOWN";
      counts[t] = (counts[t] || 0) + 1;
    }
    return counts;
  }

  function getEntityColor(type) {
    return ENTITY_COLORS[type] || DEFAULT_ENTITY_COLOR;
  }

  function groupEntitiesByType(entities) {
    const safe = safeEntityList(entities);
    const groups = {};
    for (const ent of safe) {
      const t = ent.type || "UNKNOWN";
      if (!groups[t]) groups[t] = [];
      groups[t].push(ent);
    }
    return groups;
  }

  /* ─── Statement card renderer ─── */

  function renderStatementCard(statement) {
    const entityList = safeEntityList(statement.entities);
    const sequence = statement.temporal_sequence ?? [];
    const hedgeWords = statement.hedge_words_found ?? [];
    const typeCounts = getEntityTypeCounts(entityList);
    const isExpanded = expandedAnalysis[statement.id];

    return (
      <div key={statement.id} style={cardStyle}>
        {/* Top row */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "12px",
          }}
        >
          <div>
            <span
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 600,
                fontSize: "16px",
              }}
            >
              {statement.witness_label}
            </span>
            <span
              style={{
                marginLeft: "12px",
                fontSize: "12px",
                color: "var(--text-muted)",
              }}
            >
              {relativeTime(statement.created_at)}
            </span>
          </div>
          <button
            onClick={() => handleDelete(statement.id)}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
              padding: "4px",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--danger)")}
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = "var(--text-muted)")
            }
          >
            <Trash2 size={16} />
          </button>
        </div>

        {/* Entity type badges */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "6px",
            marginBottom: "12px",
          }}
        >
          {Object.entries(typeCounts).map(([type, count]) => {
            const colors = getEntityColor(type);
            return (
              <span
                key={type}
                style={{
                  padding: "3px 10px",
                  borderRadius: "999px",
                  background: colors.bg,
                  color: colors.color,
                  fontSize: "11px",
                  fontWeight: 600,
                }}
              >
                {count} {type}
              </span>
            );
          })}
        </div>

        {/* Statement preview */}
        <p
          style={{
            fontSize: "14px",
            color: "var(--text-secondary)",
            lineHeight: 1.6,
            marginBottom: "12px",
          }}
        >
          {statement.raw_text.length > 150
            ? statement.raw_text.slice(0, 150) + "..."
            : statement.raw_text}
        </p>

        {/* Bottom row flags */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
            alignItems: "center",
            marginBottom: "12px",
          }}
        >
          {statement.hedge_marker_count >= 3 && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "3px 10px",
                borderRadius: "999px",
                background: "rgba(245,158,11,0.12)",
                color: "var(--warning)",
                fontSize: "11px",
                fontWeight: 600,
              }}
            >
              <AlertTriangle size={12} />
              High Uncertainty
            </span>
          )}
          {statement.hedge_marker_count > 0 &&
            statement.hedge_marker_count < 3 && (
              <span
                style={{
                  fontSize: "12px",
                  color: "var(--text-muted)",
                }}
              >
                {statement.hedge_marker_count} uncertainty markers
              </span>
            )}
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            {sequence.length} temporal events
          </span>
        </div>

        {/* Expandable analysis */}
        <button
          onClick={() => toggleAnalysis(statement.id)}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--accent)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "13px",
            fontWeight: 500,
            padding: "4px 0",
          }}
        >
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          View Analysis
        </button>

        {isExpanded && (
          <div
            style={{
              marginTop: "16px",
              paddingTop: "16px",
              borderTop: "1px solid var(--border)",
            }}
          >
            {/* ENTITIES */}
            <div style={{ marginBottom: "20px" }}>
              <h4
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  marginBottom: "10px",
                  color: "var(--text-primary)",
                }}
              >
                Entities
              </h4>
              {entityList.length === 0 ? (
                <p
                  style={{
                    fontSize: "13px",
                    color: "var(--text-muted)",
                    fontStyle: "italic",
                  }}
                >
                  No entities detected.
                </p>
              ) : (
                Object.entries(groupEntitiesByType(entityList)).map(
                  ([type, ents]) => (
                    <div
                      key={type}
                      style={{
                        marginBottom: "8px",
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          color: getEntityColor(type).color,
                          minWidth: "100px",
                        }}
                      >
                        {type}:
                      </span>
                      {ents.map((ent, i) => (
                        <span
                          key={i}
                          style={{
                            padding: "2px 10px",
                            borderRadius: "999px",
                            background: "var(--bg-muted)",
                            fontSize: "12px",
                            color: "var(--text-primary)",
                          }}
                        >
                          {ent.text}
                        </span>
                      ))}
                    </div>
                  )
                )
              )}
            </div>

            {/* TEMPORAL SEQUENCE */}
            <div style={{ marginBottom: "20px" }}>
              <h4
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  marginBottom: "10px",
                  color: "var(--text-primary)",
                }}
              >
                Temporal Sequence
              </h4>
              {sequence.length === 0 ? (
                <p
                  style={{
                    fontSize: "13px",
                    color: "var(--text-muted)",
                    fontStyle: "italic",
                  }}
                >
                  No temporal markers detected in this statement.
                </p>
              ) : (
                <ol
                  style={{
                    margin: 0,
                    paddingLeft: "20px",
                    listStyle: "none",
                    counterReset: "seq",
                  }}
                >
                  {sequence.map((event, i) => (
                    <li
                      key={i}
                      style={{
                        marginBottom: "8px",
                        fontSize: "13px",
                        color: "var(--text-secondary)",
                        lineHeight: 1.6,
                      }}
                    >
                      <span
                        style={{
                          ...monoStyle,
                          fontSize: "11px",
                          color: "var(--text-muted)",
                          marginRight: "8px",
                        }}
                      >
                        {i + 1}.
                      </span>
                      {event.event_text}
                      {event.absolute_time && (
                        <span
                          style={{
                            ...monoStyle,
                            fontSize: "11px",
                            marginLeft: "8px",
                            color: "var(--accent)",
                          }}
                        >
                          [{event.absolute_time}]
                        </span>
                      )}
                      <span
                        style={{
                          marginLeft: "8px",
                          padding: "1px 6px",
                          borderRadius: "999px",
                          background: "var(--bg-muted)",
                          fontSize: "10px",
                          color: "var(--text-muted)",
                        }}
                      >
                        {event.marker_type}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {/* UNCERTAINTY ANALYSIS */}
            <div>
              <h4
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  marginBottom: "10px",
                  color: "var(--text-primary)",
                }}
              >
                Uncertainty Analysis
              </h4>
              {statement.hedge_marker_count === 0 && (
                <p style={{ fontSize: "13px", color: "var(--success)" }}>
                  No uncertainty markers detected.
                </p>
              )}
              {statement.hedge_marker_count > 0 &&
                statement.hedge_marker_count < 3 && (
                  <p style={{ fontSize: "13px", color: "var(--warning)" }}>
                    {statement.hedge_marker_count} uncertainty markers detected
                  </p>
                )}
              {statement.hedge_marker_count >= 3 && (
                <p
                  style={{
                    fontSize: "13px",
                    color: "var(--danger)",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <AlertTriangle size={14} />
                  High uncertainty — {statement.hedge_marker_count} markers
                  detected
                </p>
              )}
              {hedgeWords.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "6px",
                    marginTop: "8px",
                  }}
                >
                  {hedgeWords.map((word, i) => (
                    <span
                      key={i}
                      style={{
                        padding: "2px 8px",
                        borderRadius: "999px",
                        background: "var(--bg-muted)",
                        fontSize: "11px",
                        color: "var(--text-muted)",
                      }}
                    >
                      {word}
                    </span>
                  ))}
                </div>
              )}
              {statement.hedge_words_xai && (
                <p
                  style={{
                    marginTop: "8px",
                    fontSize: "12px",
                    fontStyle: "italic",
                    color: "var(--text-muted)",
                  }}
                >
                  {statement.hedge_words_xai}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ─── Render ─── */

  return (
    <AppShell>
      <div style={{ maxWidth: "820px", margin: "0 auto" }}>
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
            marginBottom: "28px",
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
            Witness Statements
          </h1>
          <span
            style={{
              fontSize: "13px",
              color: "var(--text-muted)",
              ...monoStyle,
            }}
          >
            {statements.length} statements
          </span>
        </div>

        {/* ─── Add Statement Form ─── */}
        <div style={{ ...cardStyle, marginBottom: "32px" }}>
          <h2
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 600,
              fontSize: "16px",
              marginBottom: "20px",
            }}
          >
            Add New Statement
          </h2>

          <form onSubmit={handleSubmit}>
            {/* Witness Label */}
            <div style={{ marginBottom: "16px" }}>
              <label style={labelStyle}>Witness Label *</label>
              <input
                type="text"
                value={witnessLabel}
                onChange={(e) => setWitnessLabel(e.target.value)}
                placeholder="e.g. Witness A, John D., Security Guard"
                required
                maxLength={100}
                style={inputStyle}
              />
              <span
                style={{
                  fontSize: "11px",
                  color: "var(--text-muted)",
                  marginTop: "4px",
                  display: "block",
                }}
              >
                Use a label or pseudonym — avoid real names in labels
              </span>
            </div>

            {/* Statement Text */}
            <div style={{ marginBottom: "16px" }}>
              <label style={labelStyle}>Statement Text *</label>
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="Enter the full witness statement here..."
                required
                rows={8}
                style={{
                  ...inputStyle,
                  resize: "vertical",
                  lineHeight: 1.6,
                }}
              />
              <span
                style={{
                  fontSize: "11px",
                  color:
                    rawText.length > 45000
                      ? "var(--danger)"
                      : "var(--text-muted)",
                  marginTop: "4px",
                  display: "block",
                  ...monoStyle,
                }}
              >
                {rawText.length} / 50000 characters
              </span>
            </div>

            {/* Evidence Dropdown */}
            <div style={{ marginBottom: "20px" }}>
              <label style={labelStyle}>
                Link to uploaded document (optional)
              </label>
              <select
                value={sourceEvidenceId}
                onChange={(e) => setSourceEvidenceId(e.target.value)}
                style={inputStyle}
              >
                <option value="">— None —</option>
                {evidenceList.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.filename}
                  </option>
                ))}
              </select>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting || !witnessLabel.trim() || !rawText.trim()}
              style={{
                background: "var(--accent)",
                color: "#fff",
                border: "none",
                borderRadius: "var(--radius-sm)",
                padding: "10px 24px",
                fontSize: "14px",
                fontWeight: 600,
                cursor: submitting ? "not-allowed" : "pointer",
                opacity: submitting ? 0.7 : 1,
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              {submitting && <Spinner size={14} />}
              {submitting ? "Analyzing..." : "Analyze Statement"}
            </button>

            {formError && (
              <p
                style={{
                  marginTop: "12px",
                  fontSize: "13px",
                  color: "var(--danger)",
                }}
              >
                {formError}
              </p>
            )}
            {successMsg && (
              <p
                style={{
                  marginTop: "12px",
                  fontSize: "13px",
                  color: "var(--success)",
                }}
              >
                {successMsg}
              </p>
            )}
          </form>
        </div>

        {/* ─── Statements List ─── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "16px",
          }}
        >
          <h2
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 600,
              fontSize: "18px",
              margin: 0,
            }}
          >
            Recorded Statements
          </h2>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            ({statements.length})
          </span>
        </div>

        {listLoading && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {!listLoading && statements.length === 0 && (
          <div
            style={{
              textAlign: "center",
              padding: "60px 20px",
              color: "var(--text-muted)",
            }}
          >
            <Users size={48} style={{ marginBottom: "16px", opacity: 0.5 }} />
            <p style={{ fontSize: "16px", marginBottom: "6px" }}>
              No statements recorded yet.
            </p>
            <p style={{ fontSize: "13px" }}>
              Add a witness statement above to begin.
            </p>
          </div>
        )}

        {!listLoading &&
          statements.length > 0 &&
          statements.map((s) => renderStatementCard(s))}
      </div>
    </AppShell>
  );
}
