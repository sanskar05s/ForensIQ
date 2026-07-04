export default function Textarea({ label, error, style, ...props }) {
  return (
    <div style={{ marginBottom: "18px" }}>
      {label && (
        <label
          style={{
            display: "block",
            marginBottom: "8px",
            color: "var(--text-primary)",
            fontWeight: 600,
          }}
        >
          {label}
        </label>
      )}

      <textarea
        {...props}
        style={{
          width: "100%",
          minHeight: "120px",
          padding: "12px",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--border)",
          background: "var(--bg-surface)",
          color: "var(--text-primary)",
          resize: "vertical",
          fontSize: "15px",
          outline: "none",
          ...style,
        }}
      />

      {error && (
        <p
          style={{
            color: "var(--danger)",
            marginTop: "6px",
            fontSize: "13px",
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
