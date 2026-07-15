import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { UploadCloud, FileText, Image, Video, Music } from "lucide-react";

import AppShell from "../components/layout/AppShell";
import Button from "../components/ui/Button";
import Spinner from "../components/loading/Spinner";

import { uploadEvidence } from "../supabase/storage";
import { createEvidence } from "../supabase/db";
import { apiClient } from "../api/client";

import { parseSupabaseError } from "../utils/supabaseErrors";

export default function EvidenceUpload() {
  const { caseId } = useParams();
  const navigate = useNavigate();

  const inputRef = useRef(null);

  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [statusLabel, setStatusLabel] = useState("");

  function detectType(file) {
    if (!file) return "";

    if (file.type.startsWith("image/")) return "image";

    if (file.type === "application/pdf" || file.type.startsWith("application/"))
      return "document";

    if (file.type.startsWith("video/")) return "video";

    if (file.type.startsWith("audio/")) return "audio";

    return "";
  }

  function validateFile(selectedFile) {
    if (!selectedFile) return false;

    if (selectedFile.size > 100 * 1024 * 1024) {
      setError("File exceeds 100MB limit.");
      return false;
    }

    const type = detectType(selectedFile);

    if (!type) {
      setError("File type not supported.");
      return false;
    }

    setError("");
    return true;
  }

  function handleFile(selectedFile) {
    if (!validateFile(selectedFile)) return;

    setFile(selectedFile);
  }

  function onBrowse(e) {
    const selected = e.target.files[0];

    if (selected) {
      handleFile(selected);
    }
  }

  function onDrop(e) {
    e.preventDefault();

    setDragging(false);

    const dropped = e.dataTransfer.files[0];

    if (dropped) {
      handleFile(dropped);
    }
  }

  function formatSize(bytes) {
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

  async function handleUpload() {
    if (!file) return;

    setUploading(true);
    setError("");
    setStatusLabel("");

    try {
      // Step 1: Upload to Supabase Storage
      setStatusLabel("Uploading...");
      const upload = await uploadEvidence(caseId, file);

      if (upload.error) {
        throw upload.error;
      }

      // Step 2: Insert evidence record
      setStatusLabel("Saving...");
      const evidence = await createEvidence({
        case_id: caseId,
        filename: file.name,
        type: detectType(file),
        storage_path: upload.data.path,
        file_size: file.size,
        mime_type: file.type,
        status: "uploaded",
      });

      // Step 3: Trigger analysis based on evidence type (best-effort)
      const evidenceType = detectType(file);
      if (evidenceType === "image") {
        setStatusLabel("Analyzing image...");
        try {
          await apiClient(
            `/visual/cases/${caseId}/evidence/${evidence.id}/analyze-image`,
            { method: "POST" }
          );
        } catch (e) {
          // Best-effort — don't block on analysis failure
        }
      } else if (evidenceType === "document") {
        setStatusLabel("Extracting document content...");
        try {
          await apiClient(
            `/doc/cases/${caseId}/evidence/${evidence.id}/extract-document`,
            { method: "POST" }
          );
        } catch (e) {
          // Best-effort — don't block on extraction failure
        }
      }

      // Step 4: Blockchain anchoring (best-effort, only if hash available)
      if (evidence.file_hash) {
        setStatusLabel("Anchoring to blockchain...");
        try {
          await apiClient("/blockchain/write", {
            method: "POST",
            body: JSON.stringify({
              evidence_id: evidence.id,
              sha256: evidence.file_hash,
            }),
          });
        } catch (e) {
          // Best-effort — don't block on blockchain failure
        }
      }

      // Step 5: Done
      setStatusLabel("Complete ✓");
      setTimeout(() => navigate(`/cases/${caseId}`), 1500);
    } catch (err) {
      setError(parseSupabaseError(err));
      // Still navigate on critical failure after delay
      setTimeout(() => navigate(`/cases/${caseId}`), 2000);
    } finally {
      setUploading(false);
    }
  }

  return (
    <AppShell>
      <div
        style={{
          maxWidth: "850px",
          margin: "0 auto",
        }}
      >
        <button
          onClick={() => navigate(`/cases/${caseId}`)}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--accent)",
            cursor: "pointer",
            marginBottom: "20px",
          }}
        >
          ← Back to Case
        </button>

        <h1>Upload Evidence</h1>

        <p
          style={{
            color: "var(--text-secondary)",
            marginBottom: "30px",
          }}
        >
          Upload images, documents, videos or audio files as investigation
          evidence.
        </p>

        <input ref={inputRef} type="file" hidden onChange={onBrowse} />

        <div
          onClick={() => inputRef.current.click()}
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

            padding: "60px",

            textAlign: "center",

            borderRadius: "14px",

            cursor: "pointer",

            transition: ".2s",
          }}
        >
          <UploadCloud size={60} color="var(--text-secondary)" />

          <h2
            style={{
              marginTop: "18px",
            }}
          >
            Drag & Drop files here
          </h2>

          <p
            style={{
              color: "var(--text-secondary)",
            }}
          >
            or click anywhere to browse
          </p>

          <p
            style={{
              marginTop: "14px",
              fontSize: "14px",
              color: "var(--text-secondary)",
            }}
          >
            Images • PDFs • Documents • Video • Audio
            <br />
            Maximum file size: 100 MB
          </p>
        </div>
        {file && (
          <div
            style={{
              marginTop: "28px",
              padding: "20px",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              background: "var(--bg-surface)",
              display: "flex",
              alignItems: "center",
              gap: "16px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "48px",
                height: "48px",
                borderRadius: "10px",
                background: "rgba(37,99,235,.10)",
              }}
            >
              {getIcon(detectType(file))}
            </div>

            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  wordBreak: "break-word",
                }}
              >
                {file.name}
              </div>

              <div
                style={{
                  marginTop: "6px",
                  fontSize: "14px",
                  color: "var(--text-secondary)",
                }}
              >
                {formatSize(file.size)}
              </div>
            </div>

            <span
              style={{
                padding: "6px 12px",
                borderRadius: "999px",
                background: "rgba(37,99,235,.10)",
                color: "var(--accent)",
                fontWeight: 600,
                fontSize: "13px",
              }}
            >
              {detectType(file)}
            </span>
          </div>
        )}

        {error && (
          <div
            style={{
              marginTop: "20px",
              padding: "14px",
              borderRadius: "10px",
              background: "rgba(220,38,38,.10)",
              color: "var(--danger)",
              fontWeight: 500,
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            marginTop: "30px",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <Button onClick={handleUpload} disabled={!file || uploading}>
            {uploading ? (
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                <Spinner />
                Uploading...
              </span>
            ) : (
              "Upload Evidence"
            )}
          </Button>
        </div>

        {statusLabel && (
          <div
            style={{
              marginTop: "16px",
              textAlign: "center",
              color: statusLabel.includes("✓")
                ? "var(--success)"
                : "var(--accent)",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "13px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
            }}
          >
            {!statusLabel.includes("✓") && <Spinner size={14} />}
            {statusLabel}
          </div>
        )}
      </div>
    </AppShell>
  );
}
