import { ChevronRight, Lock } from "lucide-react";

export default function ModuleCard({
  icon,
  title,
  description,
  active = false,
  onClick,
}) {
  return (
    <div
      onClick={active ? onClick : undefined}
      style={{
        background: "var(--bg-surface)",
        border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
        borderRadius: "14px",
        padding: "20px",
        cursor: active ? "pointer" : "default",
        transition: "all .2s ease",
        opacity: active ? 1 : 0.75,
        display: "flex",
        flexDirection: "column",
        gap: "14px",
      }}
      onMouseEnter={(e) => {
        if (active) {
          e.currentTarget.style.transform = "translateY(-2px)";
          e.currentTarget.style.boxShadow = "0 8px 20px rgba(0,0,0,.08)";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        {icon}

        {active ? (
          <ChevronRight size={18} color="var(--accent)" />
        ) : (
          <Lock size={16} color="gray" />
        )}
      </div>

      <div>
        <h3
          style={{
            margin: 0,
            color: "var(--text-primary)",
          }}
        >
          {title}
        </h3>

        <p
          style={{
            marginTop: "8px",
            color: "var(--text-secondary)",
            fontSize: "14px",
            lineHeight: 1.5,
          }}
        >
          {description}
        </p>
      </div>

      <div>
        <span
          style={{
            display: "inline-block",
            padding: "5px 10px",
            borderRadius: "999px",
            fontSize: "12px",
            fontWeight: 600,
            background: active
              ? "rgba(34,197,94,.15)"
              : "rgba(156,163,175,.15)",
            color: active ? "#16a34a" : "#6b7280",
          }}
        >
          {active ? "Active" : "Coming Soon"}
        </span>
      </div>
    </div>
  );
}
