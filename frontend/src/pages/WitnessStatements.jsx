import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Users,
  Trash2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  UploadCloud,
  FileText,
  CheckCircle,
  XCircle,
  Loader,
  X,
} from "lucide-react";

import AppShell from "../components/layout/AppShell";
import Button from "../components/ui/Button";
import Spinner from "../components/loading/Spinner";
import SkeletonCard from "../components/loading/SkeletonCard";
import { apiClient } from "../api/client";
import { supabase } from "../supabase/client";
import { relativeTime } from "../utils/relativeTime";

/* ─── Queue item statuses (reused from Evidence module pattern) ─── */
const QUEUE_STATUS = {
  PENDING: "pending",
  ANALYZING: "analyzing",
  SUCCESS: "success",
  FAILED: "failed",
};

function queueStatusLabel(status) {
  switch (status) {
    case QUEUE_STATUS.PENDING:
      return "Selected";
    case QUEUE_STATUS.ANALYZING:
      return "Analysing…";
    case QUEUE_STATUS.SUCCESS:
      return "Completed";
    case QUEUE_STATUS.FAILED:
      return "Failed";
    default:
      return "";
  }
}

function queueStatusColor(status) {
  if (status === QUEUE_STATUS.SUCCESS) return "var(--success)";
  if (status === QUEUE_STATUS.FAILED) return "var(--danger)";
  return "var(--accent)";
}

function readPersistedQueue(caseId) {
  if (!caseId) return [];
  try {
    const raw = localStorage.getItem(`forensiq_witness_queue_${caseId}`);
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistQueue(caseId, queueItems) {
  if (!caseId) return;
  try {
    localStorage.setItem(
      `forensiq_witness_queue_${caseId}`,
      JSON.stringify(queueItems)
    );
  } catch {
    // Ignore storage quota issues.
  }
}

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

  /* Mode state: Option 1 (single) vs Option 2 (multi) */
  const [inputOption, setInputOption] = useState("single"); // "single" | "multi"
  const [singleSubMode, setSingleSubMode] = useState("paste"); // "paste" | "document"

  /* Option 1A: Paste state */
  const [witnessLabel, setWitnessLabel] = useState("");
  const [rawText, setRawText] = useState("");
  const [sourceEvidenceId, setSourceEvidenceId] = useState("");

  /* Option 1B: Single document state */
  const [singleDocLabel, setSingleDocLabel] = useState("");
  const [singleFile, setSingleFile] = useState(null);
  const [singleExtractedText, setSingleExtractedText] = useState("");
  const [singleExtracting, setSingleExtracting] = useState(false);
  const [singleDragging, setSingleDragging] = useState(false);
  const singleInputRef = useRef(null);

  /* Option 2: Multi-witness document state */
  const [multiFile, setMultiFile] = useState(null);
  const [multiParsing, setMultiParsing] = useState(false);
  const [multiDragging, setMultiDragging] = useState(false);
  const multiInputRef = useRef(null);

  /* Queue state (persisted per case) */
  const [queue, setQueue] = useState(() => readPersistedQueue(caseId));
  const [isProcessing, setIsProcessing] = useState(false);

  /* Form & Queue status messages */
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
    if (!caseId) return;
    persistQueue(caseId, queue);
  }, [caseId, queue]);

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

  /* ── Queue processing engine (adapting Evidence pattern) ── */
  const triggerProcessQueue = useCallback(
    async (itemsToProcess) => {
      if (!itemsToProcess || itemsToProcess.length === 0) return;
      setIsProcessing(true);
      setFormError("");

      for (const item of itemsToProcess) {
        // Set item to ANALYZING
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id ? { ...q, status: QUEUE_STATUS.ANALYZING } : q
          )
        );

        try {
          await apiClient(`/witness/cases/${caseId}/statements`, {
            method: "POST",
            body: JSON.stringify({
              witness_label: item.witness_label,
              raw_text: item.raw_text,
              source_evidence_id: item.source_evidence_id,
            }),
          });

          // Set item to SUCCESS
          setQueue((prev) =>
            prev.map((q) =>
              q.id === item.id
                ? { ...q, status: QUEUE_STATUS.SUCCESS, error: "" }
                : q
            )
          );
        } catch (err) {
          // Set item to FAILED
          setQueue((prev) =>
            prev.map((q) =>
              q.id === item.id
                ? {
                    ...q,
                    status: QUEUE_STATUS.FAILED,
                    error: err.message || "Analysis failed",
                  }
                : q
            )
          );
        }
      }

      setIsProcessing(false);
      fetchStatements();
    },
    [caseId]
  );

  async function handleProcessAllPending() {
    const pendingItems = queue.filter(
      (item) => item.status === QUEUE_STATUS.PENDING
    );
    if (pendingItems.length === 0) return;
    await triggerProcessQueue(pendingItems);
  }

  function removeFromQueue(id) {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  }

  function clearCompleted() {
    setQueue((prev) =>
      prev.filter(
        (item) =>
          item.status !== QUEUE_STATUS.SUCCESS &&
          item.status !== QUEUE_STATUS.FAILED
      )
    );
  }

  /* ── Option 1A: Paste statement submit ── */
  async function handleSubmitPasted(e) {
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

    const newItem = {
      id: `witness-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      witness_label: witnessLabel.trim(),
      raw_text: rawText.trim(),
      source_evidence_id: sourceEvidenceId || undefined,
      source_name: "Direct Entry",
      status: QUEUE_STATUS.PENDING,
      error: "",
    };

    setWitnessLabel("");
    setRawText("");
    setSourceEvidenceId("");
    setQueue((prev) => [...prev, newItem]);
    setSuccessMsg("Statement added to processing queue.");
    setTimeout(() => setSuccessMsg(""), 3000);

    triggerProcessQueue([newItem]);
  }

  /* ── Option 1B: Single document extract & queue ── */
  async function handleSingleFileSelected(selectedFile) {
    if (!selectedFile) return;
    setSingleFile(selectedFile);
    setFormError("");
    setSingleExtracting(true);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const res = await apiClient(`/witness/cases/${caseId}/extract-text`, {
        method: "POST",
        body: formData,
      });

      setSingleExtractedText(res.statement_text || "");
      if (!singleDocLabel && res.suggested_label) {
        setSingleDocLabel(res.suggested_label);
      }
    } catch (err) {
      setFormError(err.message || "Failed to extract text from document.");
      setSingleFile(null);
    } finally {
      setSingleExtracting(false);
    }
  }

  async function handleSubmitSingleDoc(e) {
    e.preventDefault();
    setFormError("");
    setSuccessMsg("");

    if (!singleDocLabel.trim()) {
      setFormError("Witness label is required.");
      return;
    }
    if (!singleExtractedText.trim()) {
      setFormError("Document statement is empty or not yet extracted.");
      return;
    }
    if (singleExtractedText.trim().length < 10) {
      setFormError("Extracted statement is too short to analyze.");
      return;
    }

    const newItem = {
      id: `witness-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      witness_label: singleDocLabel.trim(),
      raw_text: singleExtractedText.trim(),
      source_name: singleFile ? singleFile.name : "Single Document",
      status: QUEUE_STATUS.PENDING,
      error: "",
    };

    setSingleDocLabel("");
    setSingleExtractedText("");
    setSingleFile(null);
    setQueue((prev) => [...prev, newItem]);
    setSuccessMsg("Document statement added to processing queue.");
    setTimeout(() => setSuccessMsg(""), 3000);

    triggerProcessQueue([newItem]);
  }

  /* ── Option 2: Multi-witness document parsing & queue ── */
  async function handleMultiFileSelected(selectedFile) {
    if (!selectedFile) return;
    setMultiFile(selectedFile);
    setFormError("");
  }

  async function handleParseMultiDocument(e) {
    e.preventDefault();
    if (!multiFile) {
      setFormError("Please select a document first.");
      return;
    }

    setMultiParsing(true);
    setFormError("");
    setSuccessMsg("");

    try {
      const formData = new FormData();
      formData.append("file", multiFile);

      const res = await apiClient(`/witness/cases/${caseId}/parse-document`, {
        method: "POST",
        body: formData,
      });

      if (!res.witnesses || res.witnesses.length === 0) {
        setFormError(
          "No recognizable 'Witness Name:' and 'Witness Statement:' pairs found in document."
        );
        return;
      }

      const newItems = res.witnesses.map((w, idx) => ({
        id: `witness-${Date.now()}-${idx}-${Math.random()
          .toString(36)
          .substring(2, 7)}`,
        witness_label: w.witness_label,
        raw_text: w.raw_text,
        source_name: multiFile.name,
        status: w.valid ? QUEUE_STATUS.PENDING : QUEUE_STATUS.FAILED,
        error: w.error || (w.valid ? "" : "Invalid witness statement"),
      }));

      setQueue((prev) => [...prev, ...newItems]);
      const fileRef = multiFile.name;
      setMultiFile(null);
      setSuccessMsg(
        `Extracted ${res.total_found} witness statement(s) from "${fileRef}".`
      );
      setTimeout(() => setSuccessMsg(""), 4000);

      const validItems = newItems.filter(
        (i) => i.status === QUEUE_STATUS.PENDING
      );
      if (validItems.length > 0) {
        triggerProcessQueue(validItems);
      }
    } catch (err) {
      setFormError(err.message || "Failed to parse multi-witness document.");
    } finally {
      setMultiParsing(false);
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

        {/* Complete original statement */}
        <div
          style={{
            fontSize: "14px",
            color: "var(--text-primary)",
            lineHeight: 1.6,
            marginBottom: "14px",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            maxHeight: "320px",
            overflowY: "auto",
            padding: "12px 14px",
            background: "var(--bg-muted)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border)",
          }}
        >
          {statement.raw_text}
        </div>

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

  const pendingCount = queue.filter(
    (item) => item.status === QUEUE_STATUS.PENDING
  ).length;
  const hasCompletedOrFailed = queue.some(
    (item) =>
      item.status === QUEUE_STATUS.SUCCESS || item.status === QUEUE_STATUS.FAILED
  );

  function onSingleDrop(e) {
    e.preventDefault();
    setSingleDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleSingleFileSelected(e.dataTransfer.files[0]);
    }
  }

  function onSingleBrowse(e) {
    if (e.target.files && e.target.files.length > 0) {
      handleSingleFileSelected(e.target.files[0]);
    }
    e.target.value = "";
  }

  function onMultiDrop(e) {
    e.preventDefault();
    setMultiDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleMultiFileSelected(e.dataTransfer.files[0]);
    }
  }

  function onMultiBrowse(e) {
    if (e.target.files && e.target.files.length > 0) {
      handleMultiFileSelected(e.target.files[0]);
    }
    e.target.value = "";
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

        {/* ─── Add Statement Workflow (Options 1 & 2) ─── */}
        <div style={{ ...cardStyle, marginBottom: "28px" }}>
          {/* Main Mode Tabs */}
          <div
            style={{
              display: "flex",
              borderBottom: "1px solid var(--border)",
              marginBottom: "20px",
              gap: "12px",
            }}
          >
            <button
              type="button"
              onClick={() => {
                setInputOption("single");
                setFormError("");
              }}
              style={{
                background: "transparent",
                border: "none",
                borderBottom:
                  inputOption === "single"
                    ? "2px solid var(--accent)"
                    : "2px solid transparent",
                color:
                  inputOption === "single"
                    ? "var(--accent)"
                    : "var(--text-secondary)",
                padding: "10px 16px",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "0.2s",
              }}
            >
              Single Witness Statement
            </button>
            <button
              type="button"
              onClick={() => {
                setInputOption("multi");
                setFormError("");
              }}
              style={{
                background: "transparent",
                border: "none",
                borderBottom:
                  inputOption === "multi"
                    ? "2px solid var(--accent)"
                    : "2px solid transparent",
                color:
                  inputOption === "multi"
                    ? "var(--accent)"
                    : "var(--text-secondary)",
                padding: "10px 16px",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "0.2s",
              }}
            >
              Multi-Witness Document
            </button>
          </div>

          {/* ── OPTION 1: SINGLE WITNESS STATEMENT ── */}
          {inputOption === "single" && (
            <div>
              {/* Sub-selector: Paste/Type vs Upload Document */}
              <div
                style={{
                  display: "flex",
                  gap: "24px",
                  marginBottom: "20px",
                  paddingBottom: "14px",
                  borderBottom: "1px dashed var(--border)",
                }}
              >
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    cursor: "pointer",
                    fontSize: "13px",
                    fontWeight: singleSubMode === "paste" ? 600 : 400,
                    color:
                      singleSubMode === "paste"
                        ? "var(--text-primary)"
                        : "var(--text-secondary)",
                  }}
                >
                  <input
                    type="radio"
                    name="singleSubMode"
                    checked={singleSubMode === "paste"}
                    onChange={() => {
                      setSingleSubMode("paste");
                      setFormError("");
                    }}
                  />
                  Paste / Type Statement Directly
                </label>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    cursor: "pointer",
                    fontSize: "13px",
                    fontWeight: singleSubMode === "document" ? 600 : 400,
                    color:
                      singleSubMode === "document"
                        ? "var(--text-primary)"
                        : "var(--text-secondary)",
                  }}
                >
                  <input
                    type="radio"
                    name="singleSubMode"
                    checked={singleSubMode === "document"}
                    onChange={() => {
                      setSingleSubMode("document");
                      setFormError("");
                    }}
                  />
                  Upload Document (Single Witness)
                </label>
              </div>

              {/* Sub-mode A: Paste / Type */}
              {singleSubMode === "paste" && (
                <form onSubmit={handleSubmitPasted}>
                  <div style={{ marginBottom: "16px" }}>
                    <label style={labelStyle}>Witness Name / Label *</label>
                    <input
                      type="text"
                      value={witnessLabel}
                      onChange={(e) => setWitnessLabel(e.target.value)}
                      placeholder="e.g. Traffic Police, Abhi, Security Guard"
                      required
                      maxLength={100}
                      style={inputStyle}
                    />
                  </div>

                  <div style={{ marginBottom: "20px" }}>
                    <label style={labelStyle}>Statement Text *</label>
                    <textarea
                      value={rawText}
                      onChange={(e) => setRawText(e.target.value)}
                      placeholder="Enter the full witness statement here..."
                      required
                      rows={6}
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

                  <Button
                    type="submit"
                    disabled={
                      !witnessLabel.trim() ||
                      !rawText.trim() ||
                      rawText.trim().length < 10
                    }
                  >
                    Add Statement to Queue
                  </Button>
                </form>
              )}

              {/* Sub-mode B: Upload Document */}
              {singleSubMode === "document" && (
                <form onSubmit={handleSubmitSingleDoc}>
                  <div style={{ marginBottom: "16px" }}>
                    <label style={labelStyle}>Witness Name / Label *</label>
                    <input
                      type="text"
                      value={singleDocLabel}
                      onChange={(e) => setSingleDocLabel(e.target.value)}
                      placeholder="e.g. Traffic Police, Dr. Ramesh (or auto-suggested from document)"
                      required
                      maxLength={100}
                      style={inputStyle}
                    />
                  </div>

                  <input
                    ref={singleInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.txt"
                    hidden
                    onChange={onSingleBrowse}
                  />

                  <div
                    onClick={() =>
                      !singleExtracting && singleInputRef.current.click()
                    }
                    onDragOver={(e) => {
                      e.preventDefault();
                      setSingleDragging(true);
                    }}
                    onDragLeave={() => setSingleDragging(false)}
                    onDrop={onSingleDrop}
                    style={{
                      border: singleDragging
                        ? "2px solid var(--accent)"
                        : "2px dashed var(--border)",
                      background: "var(--bg-muted)",
                      padding: "32px 20px",
                      textAlign: "center",
                      borderRadius: "10px",
                      cursor: singleExtracting ? "wait" : "pointer",
                      transition: "0.2s",
                      marginBottom: "18px",
                    }}
                  >
                    <UploadCloud size={36} color="var(--text-secondary)" />
                    <div
                      style={{
                        marginTop: "10px",
                        fontSize: "14px",
                        fontWeight: 600,
                      }}
                    >
                      {singleFile
                        ? singleFile.name
                        : "Click to browse or drag & drop single witness document"}
                    </div>
                    <p
                      style={{
                        fontSize: "12px",
                        color: "var(--text-muted)",
                        marginTop: "4px",
                      }}
                    >
                      PDF, DOC, DOCX, or TXT representing ONE witness statement
                    </p>
                    {singleExtracting && (
                      <div
                        style={{
                          marginTop: "10px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "8px",
                          color: "var(--accent)",
                          fontSize: "13px",
                        }}
                      >
                        <Spinner size={14} /> Extracting statement text…
                      </div>
                    )}
                  </div>

                  {singleExtractedText && (
                    <div style={{ marginBottom: "18px" }}>
                      <label style={labelStyle}>
                        Extracted Statement Text (complete)
                      </label>
                      <textarea
                        value={singleExtractedText}
                        onChange={(e) => setSingleExtractedText(e.target.value)}
                        rows={6}
                        style={{
                          ...inputStyle,
                          resize: "vertical",
                          lineHeight: 1.6,
                        }}
                      />
                      <span
                        style={{
                          fontSize: "11px",
                          color: "var(--text-muted)",
                          marginTop: "4px",
                          display: "block",
                          ...monoStyle,
                        }}
                      >
                        {singleExtractedText.length} characters extracted
                      </span>
                    </div>
                  )}

                  <Button
                    type="submit"
                    disabled={
                      !singleDocLabel.trim() ||
                      !singleExtractedText.trim() ||
                      singleExtracting
                    }
                  >
                    Add Document Statement to Queue
                  </Button>
                </form>
              )}
            </div>
          )}

          {/* ── OPTION 2: MULTI-WITNESS DOCUMENT ── */}
          {inputOption === "multi" && (
            <form onSubmit={handleParseMultiDocument}>
              <p
                style={{
                  fontSize: "13px",
                  color: "var(--text-secondary)",
                  marginBottom: "16px",
                  lineHeight: 1.5,
                }}
              >
                Upload one PDF, DOC/DOCX, or TXT document containing multiple
                witness statements labeled with <code>Witness Name:</code> and{" "}
                <code>Witness Statement:</code>. The parser will split the
                document and queue each statement independently for NLP analysis.
              </p>

              <input
                ref={multiInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.txt"
                hidden
                onChange={onMultiBrowse}
              />

              <div
                onClick={() =>
                  !multiParsing && multiInputRef.current.click()
                }
                onDragOver={(e) => {
                  e.preventDefault();
                  setMultiDragging(true);
                }}
                onDragLeave={() => setMultiDragging(false)}
                onDrop={onMultiDrop}
                style={{
                  border: multiDragging
                    ? "2px solid var(--accent)"
                    : "2px dashed var(--border)",
                  background: "var(--bg-muted)",
                  padding: "40px 20px",
                  textAlign: "center",
                  borderRadius: "10px",
                  cursor: multiParsing ? "wait" : "pointer",
                  transition: "0.2s",
                  marginBottom: "20px",
                }}
              >
                <UploadCloud size={40} color="var(--text-secondary)" />
                <div
                  style={{
                    marginTop: "12px",
                    fontSize: "15px",
                    fontWeight: 600,
                  }}
                >
                  {multiFile
                    ? multiFile.name
                    : "Drag & Drop multi-witness document here, or click to browse"}
                </div>
                <p
                  style={{
                    fontSize: "12px",
                    color: "var(--text-muted)",
                    marginTop: "6px",
                  }}
                >
                  Supports PDF, DOC, DOCX, TXT • Optional case metadata at start
                  is automatically ignored
                </p>
                {multiFile && (
                  <div
                    style={{
                      marginTop: "10px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "4px 12px",
                      borderRadius: "999px",
                      background: "rgba(37,99,235,.10)",
                      color: "var(--accent)",
                      fontSize: "12px",
                      fontWeight: 500,
                    }}
                  >
                    <FileText size={14} /> Ready to parse: {multiFile.name}
                  </div>
                )}
              </div>

              <Button type="submit" disabled={!multiFile || multiParsing}>
                {multiParsing ? (
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <Spinner size={14} />
                    Extracting & Splitting Witnesses…
                  </span>
                ) : (
                  "Extract & Queue Witnesses"
                )}
              </Button>
            </form>
          )}

          {/* Form error / success alerts */}
          {formError && (
            <div
              style={{
                marginTop: "16px",
                padding: "12px 16px",
                borderRadius: "8px",
                background: "rgba(220,38,38,.10)",
                color: "var(--danger)",
                fontSize: "13px",
                fontWeight: 500,
              }}
            >
              {formError}
            </div>
          )}
          {successMsg && (
            <div
              style={{
                marginTop: "16px",
                padding: "12px 16px",
                borderRadius: "8px",
                background: "rgba(34,197,94,.10)",
                color: "var(--success)",
                fontSize: "13px",
                fontWeight: 500,
              }}
            >
              {successMsg}
            </div>
          )}
        </div>

        {/* ─── Processing Queue (Reusing Evidence Module Pattern) ─── */}
        {queue.length > 0 && (
          <div
            style={{
              marginBottom: "32px",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              background: "var(--bg-surface)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "14px 20px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span style={{ fontWeight: 600, fontSize: "14px" }}>
                Processing Queue ({queue.length})
              </span>
              <div style={{ display: "flex", gap: "12px" }}>
                {hasCompletedOrFailed && (
                  <button
                    onClick={clearCompleted}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--text-secondary)",
                      cursor: "pointer",
                      fontSize: "12px",
                    }}
                  >
                    Clear finished
                  </button>
                )}
              </div>
            </div>

            {queue.map((item) => (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                  padding: "12px 20px",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                {/* Icon */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "40px",
                    height: "40px",
                    borderRadius: "8px",
                    background: "rgba(37,99,235,.08)",
                    flexShrink: 0,
                  }}
                >
                  <Users size={20} color="var(--accent)" />
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: "13px",
                      color: "var(--text-primary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.witness_label}
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "var(--text-secondary)",
                      marginTop: "2px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.raw_text
                      ? item.raw_text.slice(0, 90) +
                        (item.raw_text.length > 90 ? "…" : "")
                      : "(No statement text)"}
                  </div>
                </div>

                {/* Status badge */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "12px",
                    fontFamily: "'JetBrains Mono', monospace",
                    color: queueStatusColor(item.status),
                    flexShrink: 0,
                  }}
                >
                  {item.status === QUEUE_STATUS.SUCCESS && (
                    <CheckCircle size={14} />
                  )}
                  {item.status === QUEUE_STATUS.FAILED && <XCircle size={14} />}
                  {item.status === QUEUE_STATUS.ANALYZING && (
                    <Loader size={14} className="spin" />
                  )}
                  <span>{queueStatusLabel(item.status)}</span>
                </div>

                {/* Error message */}
                {item.error && item.status === QUEUE_STATUS.FAILED && (
                  <span
                    style={{
                      fontSize: "11px",
                      color: "var(--danger)",
                      maxWidth: "160px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={item.error}
                  >
                    {item.error}
                  </span>
                )}

                {/* Remove button */}
                {(item.status === QUEUE_STATUS.PENDING ||
                  item.status === QUEUE_STATUS.FAILED) && (
                  <button
                    onClick={() => removeFromQueue(item.id)}
                    style={{
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--text-muted)",
                      padding: "4px",
                      flexShrink: 0,
                    }}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}

            {/* Bottom action button */}
            {pendingCount > 0 && (
              <div
                style={{
                  padding: "14px 20px",
                  display: "flex",
                  justifyContent: "flex-end",
                }}
              >
                <Button
                  onClick={handleProcessAllPending}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <Spinner size={14} />
                      Analysing…
                    </span>
                  ) : (
                    `Analyze ${pendingCount} Statement${
                      pendingCount > 1 ? "s" : ""
                    }`
                  )}
                </Button>
              </div>
            )}
          </div>
        )}

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

      {/* Spinner animation for Loader icon */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </AppShell>
  );
}

