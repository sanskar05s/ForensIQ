import "./ui.css";

import Button from "./Button";

/**
 * Reusable confirmation dialog.
 */
export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = "Confirm",
  onConfirm,
  onCancel,
}) {
  if (!isOpen) return null;

  return (
    <div className="fi-dialog-overlay">
      <div className="fi-dialog">
        <h2>{title}</h2>

        <p>{message}</p>

        <div className="fi-dialog-actions">
          <Button onClick={onCancel}>Cancel</Button>

          <Button onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
