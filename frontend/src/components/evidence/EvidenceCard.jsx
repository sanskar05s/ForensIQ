import { Image as ImageIcon, FileText, Video, Music } from "lucide-react";

import { relativeTime } from "../../utils/relativeTime";

function getIcon(type) {
  switch (type?.toLowerCase()) {
    case "image":
      return <ImageIcon size={20} color="#16a34a" />;
    case "document":
      return <FileText size={20} color="#2563eb" />;
    case "video":
      return <Video size={20} color="#9333ea" />;
    case "audio":
      return <Music size={20} color="#ea580c" />;
    default:
      return <FileText size={20} />;
  }
}

function formatFileSize(bytes) {
  if (!bytes) return "Unknown";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getStatusColor(status) {
  switch (status) {
    case "uploaded":
      return "#6b7280";
    case "analyzing":
      return "#eab308";
    case "analyzed":
      return "#16a34a";
    case "failed":
      return "#dc2626";
    default:
      return "#6b7280";
  }
}

export default function EvidenceCard({ evidence, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        border: "1px solid var(--border)",
        borderRadius: "12px",
        padding: "18px",
        background: "var(--bg-surface)",
        cursor: "pointer",
        transition: "0.2s",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.borderColor = "var(--accent)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.borderColor = "var(--border)")
      }
    >
      <style>{`
        @keyframes forensiq-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        {getIcon(evidence.type)}

        <span
          style={{
            fontSize: 12,
            padding: "4px 8px",
            borderRadius: "999px",
            background: getStatusColor(evidence.status),
            color: "#fff",
            animation:
              evidence.status === "analyzing"
                ? "forensiq-pulse 2s ease-in-out infinite"
                : undefined,
          }}
        >
          {evidence.status}
        </span>
      </div>

      <h3
        style={{
          marginTop: "14px",
          marginBottom: "8px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {evidence.filename}
      </h3>

      <p
        style={{
          color: "var(--text-secondary)",
          fontSize: "14px",
        }}
      >
        {relativeTime(evidence.uploaded_at)}
      </p>

      <p
        style={{
          marginTop: "8px",
          fontFamily: "monospace",
          fontSize: "13px",
        }}
      >
        {formatFileSize(evidence.file_size)}
      </p>

      {evidence.status === "analyzed" &&
        evidence.analysis_confidence != null && (
          <p
            style={{
              marginTop: "6px",
              color: "var(--text-muted)",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "11px",
            }}
          >
            {(evidence.analysis_confidence * 100).toFixed(0)}% confidence
          </p>
        )}

      {evidence.status === "analyzed" &&
        evidence.type === "document" &&
        evidence.extracted_text && (
          <p
            style={{
              marginTop: "4px",
              color: "var(--text-muted)",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "11px",
            }}
          >
            {evidence.extracted_text.length} chars extracted
          </p>
        )}

      {/* Priority Badge — shown when priority data is available */}
      {evidence.priority && (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "2px 8px",
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
            fontFamily: "'JetBrains Mono', monospace",
            marginTop: 8,
            background: (() => {
              const p = (evidence.priority || "").toUpperCase();
              if (p === "CRITICAL") return "#DC262622";
              if (p === "HIGH") return "#D9770622";
              if (p === "MEDIUM") return "#0284C722";
              return "#6B728022";
            })(),
            color: (() => {
              const p = (evidence.priority || "").toUpperCase();
              if (p === "CRITICAL") return "#DC2626";
              if (p === "HIGH") return "#D97706";
              if (p === "MEDIUM") return "#0284C7";
              return "#6B7280";
            })(),
          }}
        >
          {(evidence.priority || "LOW").toUpperCase()}
          {evidence.priority_score !== undefined && (
            <span style={{ opacity: 0.85, marginLeft: 4 }}>
              · {evidence.priority_score}/100
            </span>
          )}
        </div>
      )}
    </div>
  );
}
