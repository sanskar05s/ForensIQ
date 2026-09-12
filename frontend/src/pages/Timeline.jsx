import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Clock, AlertTriangle } from "lucide-react";

import AppShell from "../components/layout/AppShell";
import Spinner from "../components/loading/Spinner";
import SkeletonCard from "../components/loading/SkeletonCard";
import { apiClient } from "../api/client";

/* ─── Styles ─── */

const monoStyle = { fontFamily: "'JetBrains Mono', monospace" };

const DOT_COLORS = {
  confirmed: "var(--success)",
  high: "var(--accent)",
  "low-conflict": "var(--warning)",
};

const FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "confirmed", label: "Confirmed" },
  { value: "high", label: "High Confidence" },
  { value: "low-conflict", label: "Flagged" },
];

/* ─── Helpers ─── */

function formatEventTime(event) {
  if (!event.timestamp_hard) {
    return `Relative order #${event.relative_order ?? "?"}`;
  }

  const dt = new Date(event.timestamp_hard);
  if (isNaN(dt.getTime())) {
    return `Relative order #${event.relative_order ?? "?"}`;
  }

  // Evidence (metadata): show full date + time — upload time is reliable
  if (event.source === "metadata") {
    return (
      dt.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }) +
      " · " +
      dt.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      })
    );
  }

  // Witness direct: show only time — date may be inferred from EXIF
  if (event.source === "witness-direct") {
    return dt.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  // Witness relative (anchored): show time with ≈ prefix
  if (event.source === "witness-relative") {
    return (
      "≈" +
      dt.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      })
    );
  }

  // Default: full datetime
  return dt.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getSourceBadge(source) {
  if (source === "metadata") {
    return { label: "EVIDENCE", bg: "rgba(56,189,248,0.12)", color: "#38bdf8" };
  }
  if (source === "witness-direct") {
    return { label: "WITNESS (DIRECT)", bg: "rgba(59,130,246,0.10)", color: "var(--accent)" };
  }
  return { label: "WITNESS (RELATIVE)", bg: "rgba(156,163,175,0.12)", color: "var(--text-muted)" };
}

function getConfidenceBadge(state) {
  if (state === "confirmed") {
    return { label: "CONFIRMED", bg: "rgba(34,197,94,0.12)", color: "var(--success)" };
  }
  if (state === "high") {
    return { label: "HIGH", bg: "rgba(59,130,246,0.12)", color: "var(--accent)" };
  }
  return { label: "⚠ CONFLICT", bg: "rgba(245,158,11,0.12)", color: "var(--warning)" };
}

function parseDescription(desc, source) {
  if (!desc) return { label: null, text: desc || "" };
  const match = desc.match(/^\[([^\]]+)\]\s*(.*)/s);
  if (match) {
    return { label: match[1], text: match[2] };
  }
  return { label: null, text: desc };
}

/* ─── Main ─── */

export default function Timeline() {
  const { caseId } = useParams();
  const navigate = useNavigate();

  const [events, setEvents] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState(null);
  const [runError, setRunError] = useState("");
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    fetchEvents();
  }, [caseId]);

  async function fetchEvents() {
    setListLoading(true);
    try {
      const res = await apiClient(`/timeline/cases/${caseId}`);
      setEvents(res.events || []);
    } catch {
      setEvents([]);
    } finally {
      setListLoading(false);
    }
  }

  async function handleBuild() {
    setRunning(true);
    setRunResult(null);
    setRunError("");
    try {
      const res = await apiClient(`/timeline/cases/${caseId}/build`, {
        method: "POST",
      });
      setRunResult(res);
      setTimeout(() => setRunResult(null), 5000);
      fetchEvents();
    } catch (err) {
      setRunError(err.message || "Failed to build timeline.");
    } finally {
      setRunning(false);
    }
  }

  const filtered =
    filter === "all"
      ? events
      : events.filter((e) => e.confidence_state === filter);

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
            Investigation Timeline
          </h1>
          <span style={{ fontSize: "13px", color: "var(--text-muted)", ...monoStyle }}>
            {filtered.length} events
          </span>
        </div>

        {/* Action row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginBottom: "16px",
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={handleBuild}
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
            {running ? "Building timeline..." : "Rebuild Timeline"}
          </button>

          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              padding: "8px 14px",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              background: "var(--bg-muted)",
              color: "var(--text-primary)",
              fontSize: "13px",
            }}
          >
            {FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Result/error */}
        {runResult && (
          <p style={{ fontSize: "13px", color: "var(--success)", marginBottom: "12px" }}>
            {runResult.events_created || runResult.total_events || runResult.event_count || 0} events ordered.
          </p>
        )}
        {runError && (
          <p style={{ fontSize: "13px", color: "var(--danger)", marginBottom: "12px" }}>
            {runError}
          </p>
        )}

        {/* Legend */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "16px",
            fontSize: "11px",
            color: "var(--text-muted)",
            marginBottom: "24px",
            padding: "8px 12px",
            background: "var(--bg-muted)",
            borderRadius: "var(--radius-sm)",
          }}
        >
          <span>● <span style={{ color: "var(--success)" }}>green</span> = Confirmed</span>
          <span>● <span style={{ color: "var(--accent)" }}>blue</span> = High Confidence</span>
          <span>○ <span style={{ color: "var(--warning)" }}>yellow</span> = Conflict</span>
          <span>| solid line = Evidence/Direct</span>
          <span>| dashed line = Witness Relative</span>
        </div>

        {/* Loading */}
        {listLoading && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {/* Empty */}
        {!listLoading && events.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-muted)" }}>
            <Clock size={48} style={{ marginBottom: "16px", opacity: 0.5 }} />
            <p style={{ fontSize: "16px", marginBottom: "6px" }}>Timeline not yet built.</p>
            <p style={{ fontSize: "13px", marginBottom: "20px" }}>
              Add evidence and witness statements, then click Rebuild Timeline.
            </p>
            <button
              onClick={handleBuild}
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
              }}
            >
              Rebuild Timeline
            </button>
          </div>
        )}

        {/* Timeline */}
        {!listLoading && filtered.length > 0 && (
          <div style={{ position: "relative", paddingLeft: "40px" }}>
            {/* Vertical line */}
            <div
              style={{
                position: "absolute",
                left: "15px",
                top: 0,
                bottom: 0,
                width: "2px",
                background: "var(--border)",
              }}
            />

            {filtered.map((event) => {
              const dotColor = DOT_COLORS[event.confidence_state] || "var(--text-muted)";
              const isConflict = event.confidence_state === "low-conflict";
              const isRelative = event.source === "witness-relative";
              const srcBadge = getSourceBadge(event.source);
              const confBadge = getConfidenceBadge(event.confidence_state);
              const parsed = parseDescription(event.description, event.source);

              return (
                <div key={event.id} style={{ position: "relative", marginBottom: "20px" }}>
                  {/* Horizontal connector */}
                  <div
                    style={{
                      position: "absolute",
                      left: "-25px",
                      top: "18px",
                      width: "20px",
                      height: "2px",
                      borderTop: isRelative
                        ? "2px dashed var(--border)"
                        : "2px solid var(--border)",
                    }}
                  />
                  {/* Dot */}
                  <div
                    style={{
                      position: "absolute",
                      left: "-32px",
                      top: "12px",
                      width: "14px",
                      height: "14px",
                      borderRadius: "50%",
                      background: isConflict ? "transparent" : dotColor,
                      border: isConflict ? `2px solid ${dotColor}` : "2px solid var(--bg)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      zIndex: 1,
                    }}
                  >
                    {isConflict && (
                      <AlertTriangle size={8} color={dotColor} />
                    )}
                  </div>

                  {/* Card */}
                  <div
                    style={{
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-md)",
                      padding: "16px",
                    }}
                  >
                    {/* Top badges */}
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "6px",
                        marginBottom: "10px",
                      }}
                    >
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: "999px",
                          fontSize: "10px",
                          fontWeight: 700,
                          background: srcBadge.bg,
                          color: srcBadge.color,
                          letterSpacing: "0.5px",
                        }}
                      >
                        {srcBadge.label}
                      </span>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: "999px",
                          fontSize: "10px",
                          fontWeight: 700,
                          background: confBadge.bg,
                          color: confBadge.color,
                          letterSpacing: "0.5px",
                        }}
                      >
                        {confBadge.label}
                      </span>
                    </div>

                    {/* Timestamp */}
                    <div
                      style={{
                        ...monoStyle,
                        fontSize: "12px",
                        marginBottom: "8px",
                        color: event.timestamp_hard
                          ? "var(--text-primary)"
                          : "var(--text-muted)",
                      }}
                    >
                      {formatEventTime(event)}
                    </div>

                    {/* Description */}
                    <div style={{ fontSize: "14px", color: "var(--text-primary)", lineHeight: 1.6 }}>
                      {parsed.label && (
                        <span
                          style={{
                            display: "inline-block",
                            padding: "1px 6px",
                            borderRadius: "999px",
                            background: "var(--bg-muted)",
                            fontSize: "11px",
                            color: "var(--text-muted)",
                            marginRight: "6px",
                            fontWeight: 500,
                          }}
                        >
                          {parsed.label}
                        </span>
                      )}
                      {parsed.text}
                    </div>

                    {/* Conflict note */}
                    {isConflict && (
                      <div
                        style={{
                          marginTop: "10px",
                          padding: "8px 12px",
                          borderRadius: "var(--radius-sm)",
                          background: "rgba(245,158,11,0.08)",
                          borderLeft: "3px solid var(--warning)",
                          fontSize: "12px",
                          color: "var(--warning)",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <AlertTriangle size={12} />
                        Time conflict detected — another witness reports a different time for this event.
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
