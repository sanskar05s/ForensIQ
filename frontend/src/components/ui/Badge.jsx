import "./ui.css";

/**
 * Reusable Badge component.
 */
export default function Badge({ variant = "neutral", children }) {
  return <span className={`fi-badge fi-badge-${variant}`}>{children}</span>;
}
