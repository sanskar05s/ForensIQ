import Spinner from "./Spinner";
import "./loading.css";

export default function LoadingOverlay({ label = "Loading..." }) {
  return (
    <div className="fi-loading-overlay">
      <div className="forensiq-loading-logo">
        <h1>ForensIQ</h1>
      </div>

      <div className="forensiq-loading-spinner">
        <Spinner size={32} />
      </div>

      <div className="forensiq-loading-label">{label}</div>
    </div>
  );
}
