import "./ui.css";

export default function Button({
  children,
  type = "button",
  onClick,
  disabled = false,
}) {
  return (
    <button
      className="fi-btn"
      type={type}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
