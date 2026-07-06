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
              marginTop: "8px",
              color: "var(--accent)",
              fontFamily: "monospace",
            }}
          >
            {(evidence.analysis_confidence * 100).toFixed(0)}% confidence
          </p>
        )}
    </div>
  );
}
