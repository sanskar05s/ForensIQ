import "./loading.css";

export default function Spinner({ size = 20, color = "var(--accent)" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 50 50" className="fi-spinner">
      <circle
        cx="25"
        cy="25"
        r="20"
        fill="none"
        stroke={color}
        strokeWidth="4"
      />
    </svg>
  );
}
