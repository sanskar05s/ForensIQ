export default function Select({
  label,
  error,
  options = [],
  children,
  style,
  ...props
}) {
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

      <select
        {...props}
        style={{
          width: "100%",
          padding: "12px",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--border)",
          background: "var(--bg-surface)",
          color: "var(--text-primary)",
          fontSize: "15px",
          outline: "none",
          ...style,
        }}
      >
        {children
          ? children
          : options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
      </select>

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
