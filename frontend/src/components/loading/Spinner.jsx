import "./loading.css";

const SIZE_MAP = { small: 20, medium: 24, large: 32 };

export default function Spinner({ size = 20, color = "var(--accent)" }) {
  const px = typeof size === "string" ? (SIZE_MAP[size] ?? 20) : size;
  return (
    <svg width={px} height={px} viewBox="0 0 50 50" className="fi-spinner">
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
