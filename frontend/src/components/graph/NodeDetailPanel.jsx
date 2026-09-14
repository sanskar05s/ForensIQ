import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { X } from "lucide-react";
import { NODE_COLORS } from "../../constants";
import { apiGet } from "../../api/client";

const monoStyle = { fontFamily: "'JetBrains Mono', monospace" };

const TYPE_DESCRIPTIONS = {
  PERSON: "Individual person mentioned by witnesses",
  LOCATION: "Physical location or place",
  VEHICLE: "Vehicle — car, motorcycle, or other transport",
  OBJECT: "Physical object detected in evidence",
  ORGANIZATION: "Organisation, institution, or group",
  EVENT: "Described event or action",
  WITNESS: "Witness who submitted a statement in this investigation",
  TIME: "Temporal reference",
};

export default function NodeDetailPanel({
  node,
  caseId: propCaseId,
  onClose,
  cachedStatements,
  edges = [],
}) {
  const { caseId: paramCaseId } = useParams();
  const caseId = propCaseId || paramCaseId;

  const [intelligence, setIntelligence] = useState(null);
  const [loadingIntel, setLoadingIntel] = useState(false);

  useEffect(() => {
    if (!node?.label || !caseId) return;
    setLoadingIntel(true);
    apiGet(
      `/graph/cases/${caseId}/entity-intelligence/${encodeURIComponent(node.label)}`
    )
      .then((res) => setIntelligence(res.data || res || null))
      .catch(() => setIntelligence(null))
      .finally(() => setLoadingIntel(false));
  }, [node?.label, caseId]);

  if (!node) return null;

  const color = NODE_COLORS[node.type] || "#7B8FAE";

  const connectedEdges = Array.isArray(node.connectedEdges)
    ? node.connectedEdges
    : (edges || []).filter((e) => e.source === node.id || e.target === node.id);

  const referenced = cachedStatements.filter((stmt) => {
    if (node.type === "WITNESS") {
      const matchesId =
        Array.isArray(node.statementIds) && node.statementIds.includes(stmt.id);
      const matchesLabel =
        Boolean(stmt.witness_label && node.label) &&
        stmt.witness_label.toLowerCase() === node.label.toLowerCase();
      return matchesId || matchesLabel;
    }

    let entities = stmt.entities;
    if (typeof entities === "string") {
      try {
        entities = JSON.parse(entities);
      } catch {
        entities = [];
      }
    }
    if (!Array.isArray(entities)) return false;

    return entities.some(
      (e) => (e.text || "").toLowerCase() === (node.label || "").toLowerCase()
    );
  });

  return (
    <div
      style={{
        position: "absolute",
        right: 0,
        top: 0,
        bottom: 0,
        width: "280px",
        background: "var(--bg-elevated, var(--bg-surface))",
        borderLeft: "1px solid var(--border)",
        padding: "20px",
        overflowY: "auto",
        zIndex: 10,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
        }}
      >
        <span
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 600,
            fontSize: "16px",
          }}
        >
          {node.label}
        </span>
        <button
          onClick={onClose}
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "var(--text-muted)",
            padding: "4px",
          }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Type badge */}
      <span
        style={{
          display: "inline-block",
          padding: "3px 10px",
          borderRadius: "999px",
          fontSize: "10px",
          fontWeight: 700,
          background: `${color}1a`,
          color: color,
          letterSpacing: "0.5px",
          marginBottom: "16px",
        }}
      >
        {node.type || "UNKNOWN"}
      </span>

      {/* Stats */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          marginBottom: "20px",
        }}
      >
        {[
          { label: "Centrality", value: node.centrality?.toFixed(3) ?? "—" },
          { label: "Connections", value: node.degree ?? "—" },
          { label: "Community", value: node.communityId != null ? `#${node.communityId}` : "—" },
          { label: "Mentions", value: node.mentionCount ?? "—" },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "12px",
            }}
          >
            <span style={{ color: "var(--text-muted)" }}>{stat.label}</span>
            <span style={{ ...monoStyle, color: "var(--text-primary)" }}>
              {stat.value}
            </span>
          </div>
        ))}
      </div>

      {/* Cross-module intelligence */}
      <div
        style={{
          borderTop: "1px solid var(--border)",
          paddingTop: 12,
          marginTop: 10,
          marginBottom: 20,
        }}
      >
        <div
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            color: "var(--accent)",
            fontWeight: 600,
            marginBottom: 8,
          }}
        >
          Case Intelligence
        </div>

        {loadingIntel && (
          <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "4px 0" }}>
            Loading...
          </div>
        )}

        {intelligence && !loadingIntel && (
          <>
            {[
              {
                label: "Witness Mentions",
                count: intelligence.witness_mentions?.length || 0,
                color: "#3B82F6",
              },
              {
                label: "Image Detections",
                count: intelligence.visual_detections?.length || 0,
                color: "#10B981",
              },
              {
                label: "Human Identifications",
                count: intelligence.human_ids?.length || 0,
                color: "#F59E0B",
              },
              {
                label: "Timeline Events",
                count: intelligence.timeline_mentions?.length || 0,
                color: "#8B5CF6",
              },
              {
                label: "Contradictions",
                count: intelligence.related_contradictions?.length || 0,
                color: "#DC2626",
              },
              {
                label: "Claim Links",
                count: intelligence.related_claims?.length || 0,
                color: "#06B6D4",
              },
            ].map((row) => (
              <div
                key={row.label}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "4px 0",
                  borderBottom: "1px solid var(--border)",
                  fontSize: 12,
                }}
              >
                <span style={{ color: "var(--text-secondary)" }}>{row.label}</span>
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontWeight: 700,
                    color: row.count > 0 ? row.color : "var(--text-muted)",
                    fontSize: 13,
                  }}
                >
                  {row.count}
                </span>
              </div>
            ))}

            {intelligence.source_count > 1 && (
              <div
                style={{
                  marginTop: 10,
                  padding: "6px 8px",
                  background: "var(--accent-dim, rgba(59, 130, 246, 0.1))",
                  borderRadius: 5,
                  fontSize: 11,
                  color: "var(--accent, #3B82F6)",
                  lineHeight: 1.4,
                }}
              >
                {intelligence.cross_module_note}
              </div>
            )}
          </>
        )}
      </div>

      {/* Referenced in statements */}
      <div style={{ marginBottom: "20px" }}>
        <h4
          style={{
            fontSize: "12px",
            fontWeight: 600,
            color: "var(--text-muted)",
            marginBottom: "8px",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          Referenced in statements
        </h4>
        {node.type === "WITNESS" && (
          <p
            style={{
              fontSize: 12,
              color: "var(--text-secondary)",
              paddingBottom: "8px",
            }}
          >
            This node represents a witness. Their reported entities
            are connected by blue WITNESS_REPORTED edges.
          </p>
        )}
        {referenced.length === 0 ? (
          <p style={{ fontSize: "12px", color: "var(--text-muted)", fontStyle: "italic" }}>
            Not referenced in any statement.
          </p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {referenced.map((stmt) => (
              <span
                key={stmt.id}
                style={{
                  padding: "2px 8px",
                  borderRadius: "999px",
                  background: "var(--bg-muted)",
                  fontSize: "11px",
                  color: "var(--text-primary)",
                }}
              >
                {stmt.witness_label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Edge list with provenance */}
      <div style={{ marginBottom: "20px" }}>
        <h4
          style={{
            fontSize: "12px",
            fontWeight: 600,
            color: "var(--text-muted)",
            marginBottom: "8px",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          Relationships ({connectedEdges.length})
        </h4>
        {connectedEdges.length === 0 ? (
          <p style={{ fontSize: "12px", color: "var(--text-muted)", fontStyle: "italic" }}>
            No connected relationships.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {connectedEdges.map((edge, i) => (
              <div
                key={i}
                style={{
                  fontSize: 11,
                  padding: "4px 0",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    color:
                      edge.relation === "co-mentioned"
                        ? "var(--text-muted)"
                        : "var(--accent, #3B82F6)",
                    fontSize: 10,
                  }}
                >
                  {edge.relation}
                </span>
                {" → "}
                {edge.target === node.id ? edge.source : edge.target}
                {edge.source_witness && (
                  <div
                    style={{
                      color: "var(--text-muted)",
                      fontSize: 10,
                      marginTop: 2,
                    }}
                  >
                    Reported by: {edge.source_witness}
                    {edge.evidence_text && ` — "${edge.evidence_text}"`}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Type description */}
      <div>
        <h4
          style={{
            fontSize: "12px",
            fontWeight: 600,
            color: "var(--text-muted)",
            marginBottom: "6px",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          Type
        </h4>
        <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
          {TYPE_DESCRIPTIONS[node.type] || "Entity type"}
        </p>
      </div>
    </div>
  );
}
