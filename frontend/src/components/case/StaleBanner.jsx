import { TriangleAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function StaleBanner({ caseId, staleModules, onDismiss }) {
  const navigate = useNavigate();

  if (!staleModules || staleModules.length === 0) return null;

  const buttons = [];

  if (staleModules.includes("contradictions")) {
    buttons.push({
      label: "Run Contradiction Check",
      path: `/cases/${caseId}/contradictions`,
    });
  }
  if (staleModules.includes("timeline")) {
    buttons.push({
      label: "Rebuild Timeline",
      path: `/cases/${caseId}/timeline`,
    });
  }
  if (staleModules.includes("graph")) {
    buttons.push({
      label: "Rebuild Graph",
      path: `/cases/${caseId}/knowledge-graph`,
    });
  }

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
        flexWrap: "wrap",
      }}
    >
      <TriangleAlert size={20} color="var(--warning)" style={{ flexShrink: 0 }} />

      <p
        style={{
          flex: 1,
          margin: 0,
          fontSize: "13px",
          color: "var(--text-secondary)",
          minWidth: "200px",
        }}
      >
        New witness statements added since last analysis run.
      </p>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {buttons.map((btn) => (
          <button
            key={btn.label}
            onClick={() => navigate(btn.path)}
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
            {btn.label}
          </button>
        ))}

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
    </div>
  );
}
