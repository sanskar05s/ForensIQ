import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  UploadCloud,
  FileText,
  Image,
  Video,
  Music,
  CheckCircle,
  XCircle,
  Loader,
  X,
  ArrowLeft,
} from "lucide-react";

import AppShell from "../components/layout/AppShell";
import Button from "../components/ui/Button";
import Spinner from "../components/loading/Spinner";
import SkeletonCard from "../components/loading/SkeletonCard";
import EvidenceCard from "../components/evidence/EvidenceCard";

import { uploadEvidence } from "../supabase/storage";
import { createEvidence } from "../supabase/db";
import { apiClient } from "../api/client";
import { useEvidence } from "../hooks/useEvidence";
import { parseSupabaseError } from "../utils/supabaseErrors";

/* ─── Helpers (reused from EvidenceUpload) ─── */

function detectType(file) {
  if (!file) return "";
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "application/pdf" || file.type.startsWith("application/"))
    return "document";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "";
}

function formatSize(bytes) {
  if (!bytes) return "Unknown";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getIcon(type) {
  switch (type) {
    case "image":
      return <Image size={20} />;
    case "document":
      return <FileText size={20} />;
    case "video":
      return <Video size={20} />;
    case "audio":
      return <Music size={20} />;
    default:
      return <FileText size={20} />;
  }
}

async function computeSHA256(file) {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/* ─── File queue item statuses ─── */
const FILE_STATUS = {
  PENDING: "pending",
  HASHING: "hashing",
  UPLOADING: "uploading",
  SAVING: "saving",
  ANALYZING: "analyzing",
  ANCHORING: "anchoring",
  SUCCESS: "success",
  FAILED: "failed",
};

function statusLabel(status) {
  switch (status) {
    case FILE_STATUS.PENDING:
      return "Selected";
    case FILE_STATUS.HASHING:
      return "Uploading…";
    case FILE_STATUS.UPLOADING:
      return "Uploading…";
    case FILE_STATUS.SAVING:
      return "Uploading…";
    case FILE_STATUS.ANALYZING:
      return "Analysing…";
    case FILE_STATUS.ANCHORING:
      return "Analysing…";
    case FILE_STATUS.SUCCESS:
      return "Completed";
    case FILE_STATUS.FAILED:
      return "Failed";
    default:
      return "";
  }
}

function statusColor(status) {
  if (status === FILE_STATUS.SUCCESS) return "var(--success)";
  if (status === FILE_STATUS.FAILED) return "var(--danger)";
  return "var(--accent)";
}

/* ─── Main Component ─── */

function readPersistedQueue(caseId) {
  if (!caseId) return [];

  try {
    const raw = localStorage.getItem(`forensiq_queue_${caseId}`);
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistQueue(caseId, queueItems) {
  if (!caseId) return;

  try {
    localStorage.setItem(
      `forensiq_queue_${caseId}`,
      JSON.stringify(queueItems),
    );
  } catch {
    // Ignore storage quota issues.
  }
}

export default function EvidencePage() {
  const { caseId } = useParams();
  const navigate = useNavigate();
  const inputRef = useRef(null);

  const { evidence, loading: evidenceLoading, refresh } = useEvidence(caseId);

  // Queue of files selected for upload
  const [queue, setQueue] = useState(() => readPersistedQueue(caseId));
  const [dragging, setDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [globalError, setGlobalError] = useState("");

  useEffect(() => {
    if (!caseId) return;
    persistQueue(caseId, queue);
  }, [caseId, queue]);

  /* ── File selection ── */

  function validateFile(file) {
    if (file.size > 100 * 1024 * 1024) return "File exceeds 100 MB limit.";
    if (!detectType(file)) return "File type not supported.";
    return null;
  }

  const addFiles = useCallback((fileList) => {
    setGlobalError("");
    const newItems = Array.from(fileList).map((file) => {
      const validationError = validateFile(file);
      return {
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
        file,
        type: detectType(file),
        status: validationError ? FILE_STATUS.FAILED : FILE_STATUS.PENDING,
        error: validationError || "",
      };
    });
    setQueue((prev) => [...prev, ...newItems]);
  }, []);

  function onBrowse(e) {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
    }
    // Reset so re-selecting same files works
    e.target.value = "";
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }

  function removeFromQueue(id) {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  }

  function clearCompleted() {
    setQueue((prev) =>
      prev.filter(
        (item) =>
          item.status !== FILE_STATUS.SUCCESS &&
          item.status !== FILE_STATUS.FAILED,
      ),
    );
  }

  /* ── Upload pipeline (processes each file independently) ── */

  async function uploadSingleFile(item, updateItem) {
    const { file } = item;

    try {
      // Step 1: Hash
      updateItem(FILE_STATUS.HASHING);
      const fileHash = await computeSHA256(file);

      // Step 2: Upload to storage
      updateItem(FILE_STATUS.UPLOADING);
      const upload = await uploadEvidence(caseId, file);
      if (upload.error) throw upload.error;

      // Step 3: Create evidence record
      updateItem(FILE_STATUS.SAVING);
      const record = await createEvidence({
        case_id: caseId,
        filename: file.name,
        type: detectType(file),
        storage_path: upload.data.path,
        file_size: file.size,
        mime_type: file.type,
        status: "uploaded",
        file_hash: fileHash,
      });

      // Step 4: Trigger analysis (best-effort)
      const evidenceType = detectType(file);
      if (evidenceType === "image") {
        updateItem(FILE_STATUS.ANALYZING);
        try {
          await apiClient(
            `/visual/cases/${caseId}/evidence/${record.id}/analyze-image`,
            { method: "POST" },
          );
        } catch {
          // best-effort
        }
      } else if (evidenceType === "document") {
        updateItem(FILE_STATUS.ANALYZING);
        try {
          await apiClient(
            `/doc/cases/${caseId}/evidence/${record.id}/extract-document`,
            { method: "POST" },
          );
        } catch {
          // best-effort
        }
      }

      // Step 5: Blockchain anchoring (best-effort)
      updateItem(FILE_STATUS.ANCHORING);
      try {
        await apiClient("/blockchain/write", {
          method: "POST",
          body: JSON.stringify({
            evidence_id: record.id,
            sha256: fileHash,
          }),
        });
      } catch {
        // best-effort
      }

      // Done
      updateItem(FILE_STATUS.SUCCESS);
    } catch (err) {
      updateItem(FILE_STATUS.FAILED, parseSupabaseError(err));
    }
  }

  async function handleUploadAll() {
    const pendingItems = queue.filter(
      (item) => item.status === FILE_STATUS.PENDING,
    );
    if (pendingItems.length === 0) return;

    setIsUploading(true);
    setGlobalError("");

    // Process files sequentially to avoid overwhelming the backend
    for (const item of pendingItems) {
      const updateItem = (status, error) => {
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id ? { ...q, status, error: error || q.error } : q,
          ),
        );
      };
      await uploadSingleFile(item, updateItem);
    }

    setIsUploading(false);
    // Refresh evidence list to show new uploads
    refresh();
  }

  const pendingCount = queue.filter(
    (item) => item.status === FILE_STATUS.PENDING,
  ).length;
  const hasCompletedOrFailed = queue.some(
    (item) =>
      item.status === FILE_STATUS.SUCCESS || item.status === FILE_STATUS.FAILED,
  );

  return (
    <AppShell>
      <div style={{ maxWidth: "960px", margin: "0 auto" }}>
        {/* Back button */}
        <button
          onClick={() => navigate(`/cases/${caseId}`)}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--accent)",
            cursor: "pointer",
            marginBottom: "20px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <ArrowLeft size={18} />
          Back to Case
        </button>

        {/* Header */}
        <h1
          style={{
            fontSize: "32px",
            marginBottom: "8px",
            color: "var(--text-primary)",
          }}
        >
          Evidence
        </h1>
        <p
          style={{
            color: "var(--text-secondary)",
            marginBottom: "32px",
            fontSize: "15px",
          }}
        >
          Upload, review, and manage evidence for this investigation.
        </p>

        {/* ── Upload Area ── */}
        <input ref={inputRef} type="file" multiple hidden onChange={onBrowse} />

        <div
          onClick={() => !isUploading && inputRef.current.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          style={{
            border: dragging
              ? "2px solid var(--accent)"
              : "2px dashed var(--border)",
            background: "var(--bg-surface)",
            padding: "48px 24px",
            textAlign: "center",
            borderRadius: "14px",
            cursor: isUploading ? "default" : "pointer",
            transition: ".2s",
            marginBottom: "24px",
          }}
        >
          <UploadCloud size={48} color="var(--text-secondary)" />
          <h2 style={{ marginTop: "14px", fontSize: "18px" }}>
            Drag & Drop files here
          </h2>
          <p style={{ color: "var(--text-secondary)", marginTop: "4px" }}>
            or click to browse — <strong>multiple files supported</strong>
          </p>
          <p
            style={{
              marginTop: "10px",
              fontSize: "13px",
              color: "var(--text-muted)",
            }}
          >
            Images • PDFs • Documents • Video • Audio — Max 100 MB per file
          </p>
        </div>

        {/* ── File Queue ── */}
        {queue.length > 0 && (
          <div
            style={{
              marginBottom: "32px",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              background: "var(--bg-surface)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "14px 20px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span style={{ fontWeight: 600, fontSize: "14px" }}>
                Processing Queue ({queue.length})
              </span>
              <div style={{ display: "flex", gap: "12px" }}>
                {hasCompletedOrFailed && (
                  <button
                    onClick={clearCompleted}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--text-secondary)",
                      cursor: "pointer",
                      fontSize: "12px",
                    }}
                  >
                    Clear finished
                  </button>
                )}
              </div>
            </div>

            {queue.map((item) => (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                  padding: "12px 20px",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                {/* Icon */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "40px",
                    height: "40px",
                    borderRadius: "8px",
                    background: "rgba(37,99,235,.08)",
                    flexShrink: 0,
                  }}
                >
                  {getIcon(item.type)}
                </div>

                {/* File info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: "13px",
                      color: "var(--text-primary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.file.name}
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "var(--text-secondary)",
                      marginTop: "2px",
                      display: "flex",
                      gap: "8px",
                    }}
                  >
                    <span>{item.type || "unknown"}</span>
                    <span>•</span>
                    <span>{formatSize(item.file.size)}</span>
                  </div>
                </div>

                {/* Status */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "12px",
                    fontFamily: "'JetBrains Mono', monospace",
                    color: statusColor(item.status),
                    flexShrink: 0,
                  }}
                >
                  {item.status === FILE_STATUS.SUCCESS && (
                    <CheckCircle size={14} />
                  )}
                  {item.status === FILE_STATUS.FAILED && <XCircle size={14} />}
                  {![
                    FILE_STATUS.PENDING,
                    FILE_STATUS.SUCCESS,
                    FILE_STATUS.FAILED,
                  ].includes(item.status) && (
                    <Loader size={14} className="spin" />
                  )}
                  <span>{statusLabel(item.status)}</span>
                </div>

                {/* Error message */}
                {item.error && item.status === FILE_STATUS.FAILED && (
                  <span
                    style={{
                      fontSize: "11px",
                      color: "var(--danger)",
                      maxWidth: "140px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={item.error}
                  >
                    {item.error}
                  </span>
                )}

                {/* Remove button (only for pending/failed) */}
                {(item.status === FILE_STATUS.PENDING ||
                  item.status === FILE_STATUS.FAILED) && (
                  <button
                    onClick={() => removeFromQueue(item.id)}
                    style={{
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--text-muted)",
                      padding: "4px",
                      flexShrink: 0,
                    }}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}

            {/* Upload button */}
            {pendingCount > 0 && (
              <div
                style={{
                  padding: "14px 20px",
                  display: "flex",
                  justifyContent: "flex-end",
                }}
              >
                <Button onClick={handleUploadAll} disabled={isUploading}>
                  {isUploading ? (
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <Spinner size={14} />
                      Uploading…
                    </span>
                  ) : (
                    `Upload ${pendingCount} file${pendingCount > 1 ? "s" : ""}`
                  )}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Global error */}
        {globalError && (
          <div
            style={{
              marginBottom: "20px",
              padding: "14px",
              borderRadius: "10px",
              background: "rgba(220,38,38,.10)",
              color: "var(--danger)",
              fontWeight: 500,
            }}
          >
            {globalError}
          </div>
        )}

        {/* ── Existing Evidence ── */}
        <h2 style={{ marginBottom: "20px", marginTop: "12px" }}>
          Existing Evidence
        </h2>

        {evidenceLoading ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))",
              gap: "18px",
            }}
          >
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : evidence.length === 0 ? (
          <div
            style={{
              padding: "32px",
              border: "1px dashed var(--border)",
              borderRadius: "12px",
              textAlign: "center",
              color: "var(--text-secondary)",
              background: "var(--bg-surface)",
            }}
          >
            <p>
              No evidence uploaded yet. Use the upload area above to add files.
            </p>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))",
              gap: "18px",
            }}
          >
            {evidence.map((item) => (
              <EvidenceCard
                key={item.id}
                evidence={item}
                onClick={() => navigate(`/cases/${caseId}/evidence/${item.id}`)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Spinner animation for Loader icon */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </AppShell>
  );
}
