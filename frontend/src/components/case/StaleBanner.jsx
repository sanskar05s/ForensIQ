import { TriangleAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function StaleBanner({ caseId, onDismiss }) {
  const navigate = useNavigate();

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "14px",
        padding: "14px 20px",
        borderRadius: "var(--radius-md)",
        borderLeft: "3px solid var(--warning)",
        background: "rgba(245,158,11,0.08)",
        marginBottom: "24px",
      }}
    >
      <TriangleAlert size={20} color="var(--warning)" style={{ flexShrink: 0 }} />

      <p
        style={{
          flex: 1,
          margin: 0,
          fontSize: "13px",
          color: "var(--text-secondary)",
        }}
      >
        New witness statements added since last contradiction analysis.
      </p>

      <button
        onClick={() => navigate(`/cases/${caseId}/contradictions`)}
        style={{
          background: "var(--accent)",
          color: "#fff",
          border: "none",
          borderRadius: "var(--radius-sm)",
          padding: "6px 16px",
          fontSize: "12px",
          fontWeight: 600,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        Run Now
      </button>

      <button
        onClick={onDismiss}
        style={{
          background: "transparent",
          border: "none",
          color: "var(--text-muted)",
          cursor: "pointer",
          fontSize: "12px",
          padding: "6px 10px",
          whiteSpace: "nowrap",
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
