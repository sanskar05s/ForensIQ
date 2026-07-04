import "./ui.css";

/**
 * Reusable Toast component.
 */
export default function Toast({ message, type = "info" }) {
  if (!message) return null;

  return <div className={`fi-toast fi-toast-${type}`}>{message}</div>;
}
