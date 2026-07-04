import { useTheme } from "../context/ThemeContext";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      style={{
        padding: "10px 18px",
        borderRadius: "8px",
        border: "1px solid var(--border)",
        background: "var(--bg-surface)",
        color: "var(--text-primary)",
        cursor: "pointer",
      }}
    >
      {theme === "light" ? "🌙 Dark Mode" : "☀️ Light Mode"}
    </button>
  );
}
