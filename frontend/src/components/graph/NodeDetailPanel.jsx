import { X } from "lucide-react";
import { NODE_COLORS } from "../../constants";

const monoStyle = { fontFamily: "'JetBrains Mono', monospace" };

const TYPE_DESCRIPTIONS = {
  PERSON: "Individual person mentioned by witnesses",
  LOCATION: "Physical location or place",
  TIME: "Temporal reference",
  OBJECT: "Physical object",
  ORGANIZATION: "Organisation or institution",
  EVENT: "Described event or action",
};

export default function NodeDetailPanel({ node, onClose, cachedStatements }) {
  if (!node) return null;

  const color = NODE_COLORS[node.type] || "#7B8FAE";

  const referenced = cachedStatements.filter((stmt) =>
    (stmt.entities || []).some(
      (e) => e.text.toLowerCase() === node.label.toLowerCase()
    )
  );

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
