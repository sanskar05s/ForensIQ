import "./ui.css";

/**
 * Reusable Card component.
 */
export default function Card({
  children,
  className = "",
  hoverable = false,
  onClick,
}) {
  const classes = ["fi-card", hoverable ? "fi-card-hover" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} onClick={onClick}>
      {children}
    </div>
  );
}
