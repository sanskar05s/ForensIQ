import ThemeToggle from "../components/ThemeToggle";

export default function Placeholder({ title }) {
  return (
    <div
      style={{
        padding: "40px",
        backgroundColor: "var(--bg)",
        minHeight: "100vh",
      }}
    >
      <ThemeToggle />

      <h1
        style={{
          color: "var(--text-primary)",
          marginBottom: "16px",
        }}
      >
        {title}
      </h1>

      <p
        style={{
          color: "var(--text-secondary)",
          fontSize: "16px",
        }}
      >
        This page will be implemented in a later milestone.
      </p>
    </div>
  );
}
