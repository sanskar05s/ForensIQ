import "./loading.css";

export default function SkeletonCard() {
  return (
    <div className="fi-skeleton-card">
      <div className="fi-skeleton shimmer title"></div>

      <div className="fi-skeleton shimmer line"></div>

      <div className="fi-skeleton shimmer line"></div>

      <div className="fi-skeleton shimmer footer"></div>
    </div>
  );
}
