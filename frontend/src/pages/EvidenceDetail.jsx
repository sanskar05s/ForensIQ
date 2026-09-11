import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Shield,
  Clock,
  ExternalLink,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  Upload,
  Hash,
  Cpu,
  GitMerge,
  Share2,
  Link,
} from "lucide-react";

import AppShell from "../components/layout/AppShell";
import Spinner from "../components/loading/Spinner";
import { supabase } from "../supabase/client";
import { apiClient } from "../api/client";
import { relativeTime } from "../utils/relativeTime";

/* ─── Tab definitions per evidence type ─── */

const TABS_BY_TYPE = {
  image: ["Preview", "Objects", "OCR", "Scene", "XAI", "Blockchain", "Journey", "Linked Claims"],
  document: ["Extracted Text", "Preview", "Metadata", "Blockchain", "Journey", "Linked Claims"],
  video: ["Preview", "Metadata", "Blockchain", "Journey", "Linked Claims"],
  audio: ["Preview", "Metadata", "Blockchain", "Journey", "Linked Claims"],
};

/* ─── Confidence pill helper ─── */

function ConfidencePill({ confidence }) {
  const pct = (confidence * 100).toFixed(0);
  let bg, color, label;

  if (confidence >= 0.9) {
    bg = "rgba(16,185,129,0.15)";
    color = "var(--success)";
    label = "HIGH";
  } else if (confidence >= 0.7) {
    bg = "rgba(245,158,11,0.15)";
    color = "var(--warning)";
    label = "MED";
  } else {
    bg = "rgba(239,68,68,0.15)";
    color = "var(--danger)";
    label = "LOW — verify";
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
      <span
        style={{
          padding: "2px 8px",
          borderRadius: "999px",
          background: bg,
          color,
          fontSize: "11px",
          fontWeight: 600,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: "12px",
          color: "var(--text-secondary)",
        }}
      >
        {pct}%
      </span>
    </span>
  );
}

/* ─── Status badge color helper ─── */

function getStatusColor(status) {
  switch (status) {
    case "uploaded":
      return "#6b7280";
    case "analyzing":
      return "#eab308";
    case "analyzed":
      return "#16a34a";
    case "failed":
      return "#dc2626";
    default:
      return "#6b7280";
  }
}

/* ─── Inline style constants ─── */

const cardStyle = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  padding: "16px",
  marginBottom: "12px",
};

const emptyStyle = {
  color: "var(--text-secondary)",
  fontStyle: "italic",
  padding: "24px 0",
};

const monoStyle = {
  fontFamily: "'JetBrains Mono', monospace",
};

/* ─── Main component ─── */

export default function EvidenceDetail() {
  const { caseId, evidenceId } = useParams();
  const navigate = useNavigate();

  const [evidence, setEvidence] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(null);

  /* Objects tab expand state */
  const [expandedBbox, setExpandedBbox] = useState({});
  const [expandedXai, setExpandedXai] = useState({});

  /* Preview tab state */
  const [signedUrl, setSignedUrl] = useState(null);
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlError, setUrlError] = useState(false);

  /* Journey tab state */
  const [journey, setJourney] = useState(null);
  const [journeyLoading, setJourneyLoading] = useState(false);

  /* Linked Claims tab state */
  const [claimLinks, setClaimLinks] = useState(null);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [buildingClaims, setBuildingClaims] = useState(false);

  /* Blockchain verify state */
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);

  useEffect(() => {
    fetchEvidence();
  }, [evidenceId]);

  async function fetchEvidence() {
    setLoading(true);
    try {
      const { data, error: err } = await supabase
        .from("evidence")
        .select("*")
        .eq("id", evidenceId)
        .single();

      if (err) throw err;

      setEvidence(data);

      const tabs = TABS_BY_TYPE[data.type] || ["Blockchain"];
      setActiveTab(tabs[0]);
    } catch (e) {
      setError("Failed to load evidence.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchSignedUrl() {
    setUrlLoading(true);
    setUrlError(false);
    try {
      const res = await apiClient(
        `/blockchain/cases/${caseId}/evidence/${evidenceId}/signed-url`
      );
      setSignedUrl(res.url);
    } catch {
      setUrlError(true);
    } finally {
      setUrlLoading(false);
    }
  }

  async function fetchJourney() {
    setJourneyLoading(true);
    try {
      const res = await apiClient(
        `/provenance/cases/${caseId}/evidence/${evidenceId}`
      );
      setJourney(res);
    } catch {
      setJourney({ steps: [] });
    } finally {
      setJourneyLoading(false);
    }
  }

  async function fetchClaimLinks() {
    setClaimsLoading(true);
    try {
      const res = await apiClient(
        `/claims/cases/${caseId}/evidence/${evidenceId}`
      );
      setClaimLinks(res);
    } catch {
      setClaimLinks({ links: [] });
    } finally {
      setClaimsLoading(false);
    }
  }

  async function handleBuildClaims() {
    setBuildingClaims(true);
    try {
      await apiClient(`/claims/cases/${caseId}/build`, { method: "POST" });
      await fetchClaimLinks();
    } catch {
      // silent
    } finally {
      setBuildingClaims(false);
    }
  }

  function handleTabChange(tab) {
    setActiveTab(tab);
    if (tab === "Preview" && !signedUrl && !urlLoading) {
      fetchSignedUrl();
    }
    if (tab === "Journey" && !journey && !journeyLoading) {
      fetchJourney();
    }
    if (tab === "Linked Claims" && !claimLinks && !claimsLoading) {
      fetchClaimLinks();
    }
  }

  function toggleBbox(idx) {
    setExpandedBbox((prev) => ({ ...prev, [idx]: !prev[idx] }));
  }

  function toggleXai(idx) {
    setExpandedXai((prev) => ({ ...prev, [idx]: !prev[idx] }));
  }

  /* ─── Loading / Error states ─── */

  if (loading) {
    return (
      <AppShell>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: "60vh",
          }}
        >
          <Spinner size={28} />
        </div>
      </AppShell>
    );
  }

  if (error || !evidence) {
    return (
      <AppShell>
        <div style={{ padding: "40px" }}>
          <h2>{error || "Evidence not found."}</h2>
          <button
            onClick={() => navigate(`/cases/${caseId}/evidence`)}
            style={{
              marginTop: "16px",
              background: "transparent",
              border: "none",
              color: "var(--accent)",
              cursor: "pointer",
            }}
          >
            ← Back to Evidence
          </button>
        </div>
      </AppShell>
    );
  }

  const tabs = TABS_BY_TYPE[evidence.type] || ["Blockchain"];

  /* ─── Tab content renderers ─── */

  function renderObjectsTab() {
    const detections = evidence.object_detections;
    if (!detections || detections.length === 0) {
      return <p style={emptyStyle}>No objects detected above confidence threshold.</p>;
    }
    return detections.map((item, idx) => (
      <div key={idx} style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
          <span style={{ fontWeight: 600, fontSize: "15px" }}>{item.label}</span>
          <ConfidencePill confidence={item.confidence} />
        </div>

        <button
          onClick={() => toggleBbox(idx)}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-secondary)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "4px",
            fontSize: "12px",
            padding: "4px 0",
          }}
        >
          {expandedBbox[idx] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          Bounding Box
        </button>
        {expandedBbox[idx] && item.bbox && (
          <div
            style={{
              ...monoStyle,
              fontSize: "12px",
              color: "var(--text-secondary)",
              padding: "8px 0 4px 18px",
            }}
          >
            [{item.bbox.map((v) => v.toFixed(1)).join(", ")}]
          </div>
        )}

        <button
          onClick={() => toggleXai(idx)}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-secondary)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "4px",
            fontSize: "12px",
            padding: "4px 0",
          }}
        >
          {expandedXai[idx] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          XAI Reason
        </button>
        {expandedXai[idx] && (
          <div
            style={{
              fontSize: "13px",
              color: "var(--text-secondary)",
              fontStyle: "italic",
              padding: "8px 0 4px 18px",
            }}
          >
            {item.analysis?.summary || "No explanation available."}
          </div>
        )}
      </div>
    ));
  }

  function renderOcrTab() {
    const blocks = evidence.ocr_text;
    if (!blocks || blocks.length === 0) {
      return <p style={emptyStyle}>No text detected in this image.</p>;
    }
    return blocks.map((item, idx) => (
      <div key={idx} style={cardStyle}>
        <div style={{ fontWeight: 500, marginBottom: "8px", fontSize: "15px" }}>
          {item.text}
        </div>
        <ConfidencePill confidence={item.confidence} />
        {item.low_confidence && (
          <div
            style={{
              marginTop: "8px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              color: "var(--warning)",
              fontSize: "12px",
            }}
          >
            <AlertTriangle size={14} />
            Low confidence — manual verification recommended
          </div>
        )}
      </div>
    ));
  }

  function renderSceneTab() {
    const scene = evidence.scene_classification;
    if (!scene || !scene.label) {
      return <p style={emptyStyle}>Scene classification not available.</p>;
    }
    return (
      <div style={cardStyle}>
        <div style={{ fontWeight: 600, fontSize: "18px", marginBottom: "8px" }}>
          {scene.label}
        </div>
        <ConfidencePill confidence={scene.confidence} />
        {scene.analysis?.summary && (
          <p style={{ color: "var(--text-secondary)", marginTop: "12px", fontSize: "14px" }}>
            {scene.analysis.summary}
          </p>
        )}
        {scene.analysis?.metadata?.note && (
          <p style={{ color: "var(--text-muted)", fontStyle: "italic", marginTop: "8px", fontSize: "13px" }}>
            {scene.analysis.metadata.note}
          </p>
        )}
      </div>
    );
  }

  function renderXaiTab() {
    if (!evidence.xai_summary) {
      return <p style={emptyStyle}>XAI summary not yet generated.</p>;
    }
    return (
      <>
        <p style={{ color: "var(--text-secondary)", fontSize: "15px", lineHeight: 1.7, marginBottom: "24px" }}>
          {evidence.xai_summary}
        </p>
        <div style={{ display: "flex", gap: "16px" }}>
          {[
            { label: "Objects detected", value: evidence.object_detections?.length || 0 },
            { label: "Text blocks extracted", value: evidence.ocr_text?.length || 0 },
            { label: "Analysis confidence", value: `${((evidence.analysis_confidence || 0) * 100).toFixed(1)}%` },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                flex: 1,
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                padding: "20px",
                textAlign: "center",
              }}
            >
              <div style={{ ...monoStyle, fontSize: "24px", fontWeight: 600, marginBottom: "6px" }}>
                {stat.value}
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }


  async function handleReverify() {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const res = await apiClient(
        `/blockchain/cases/${caseId}/evidence/${evidenceId}/verify`
      );
      setVerifyResult(res.verified ? "VERIFIED" : "COMPROMISED");
      setTimeout(() => setVerifyResult(null), 8000);
    } catch {
      setVerifyResult("ERROR");
    } finally {
      setVerifying(false);
    }
  }

  function renderBlockchainTab() {
    const hash = evidence.file_hash;
    const txHash = evidence.blockchain_tx_hash;
    const truncate = (str, len = 20) =>
      str && str.length > len ? str.slice(0, len) + "..." : str;

    return (
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          padding: "24px",
        }}
      >
        <div style={{ marginBottom: "16px" }}>
          <span style={{ color: "var(--text-muted)", fontSize: "13px" }}>File: </span>
          <span style={{ fontWeight: 500 }}>{evidence.filename}</span>
        </div>

        <div style={{ marginBottom: "16px" }}>
          <span style={{ color: "var(--text-muted)", fontSize: "13px" }}>SHA-256: </span>
          {hash ? (
            <span style={{ ...monoStyle, fontSize: "13px" }} title={hash}>
              {truncate(hash)}
            </span>
          ) : (
            <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
              Hash not yet computed
            </span>
          )}
        </div>

        <div style={{ marginBottom: "16px" }}>
          <span style={{ color: "var(--text-muted)", fontSize: "13px" }}>Sepolia Tx: </span>
          {txHash ? (
            <a
              href={`https://sepolia.etherscan.io/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                ...monoStyle,
                fontSize: "13px",
                color: "var(--accent)",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              {truncate(txHash)}
              <ExternalLink size={12} />
            </a>
          ) : (
            <span style={{ color: "var(--warning)", fontSize: "13px" }}>
              Pending — blockchain anchoring in progress
            </span>
          )}
        </div>

        <div
          style={{
            marginTop: "20px",
            paddingTop: "16px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          {txHash ? (
            <>
              <Shield size={18} color="var(--success)" />
              <span style={{ color: "var(--success)", fontWeight: 600 }}>VERIFIED</span>
            </>
          ) : (
            <>
              <Clock size={18} color="var(--warning)" />
              <span style={{ color: "var(--warning)", fontWeight: 600 }}>PENDING</span>
            </>
          )}
        </div>

        {/* Re-verify button — only when file_hash exists */}
        {hash && (
          <div style={{ marginTop: "20px" }}>
            <button
              onClick={handleReverify}
              disabled={verifying}
              style={{
                background: "transparent",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                padding: "8px 16px",
                fontSize: "13px",
                color: "var(--text-secondary)",
                cursor: verifying ? "wait" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              {verifying ? <Spinner size={14} /> : <Shield size={14} />}
              {verifying ? "Verifying..." : "Re-verify Integrity"}
            </button>

            {verifyResult === "VERIFIED" && (
              <div style={{
                marginTop: "12px", padding: "10px 14px", borderRadius: "var(--radius-sm)",
                background: "rgba(22,163,74,0.12)", border: "1px solid var(--success)",
                color: "var(--success)", fontSize: "13px", display: "flex", alignItems: "center", gap: "6px",
              }}>
                <Shield size={14} /> ✓ INTEGRITY VERIFIED — file matches blockchain record
              </div>
            )}
            {verifyResult === "COMPROMISED" && (
              <div style={{
                marginTop: "12px", padding: "10px 14px", borderRadius: "var(--radius-sm)",
                background: "rgba(220,38,38,0.12)", border: "1px solid var(--danger)",
                color: "var(--danger)", fontSize: "13px", display: "flex", alignItems: "center", gap: "6px",
              }}>
                <AlertTriangle size={14} /> ✗ INTEGRITY COMPROMISED — file may have been modified
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderPreviewTab() {
    if (urlLoading) {
      return (
        <div style={{ display: "flex", justifyContent: "center", padding: "40px" }}>
          <Spinner size={24} />
        </div>
      );
    }

    if (urlError) {
      return (
        <div style={{ textAlign: "center", padding: "40px" }}>
          <p style={{ color: "var(--text-secondary)", marginBottom: "12px" }}>
            Could not load preview. Try again.
          </p>
          <button
            onClick={fetchSignedUrl}
            style={{
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: "var(--radius-sm)",
              padding: "8px 16px",
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      );
    }

    if (!signedUrl) {
      return (
        <div style={{ display: "flex", justifyContent: "center", padding: "40px" }}>
          <Spinner size={24} />
        </div>
      );
    }

    if (evidence.type === "video") {
      return (
        <video
          controls
          src={signedUrl}
          style={{ width: "100%", borderRadius: "var(--radius-md)" }}
        />
      );
    }

    if (evidence.type === "audio") {
      return <audio controls src={signedUrl} style={{ width: "100%" }} />;
    }

    if (evidence.type === "image") {
      return (
        <img
          src={signedUrl}
          alt={evidence.filename}
          style={{
            maxWidth: "100%",
            borderRadius: "8px",
            border: "1px solid var(--border)",
          }}
        />
      );
    }

    if (evidence.type === "document") {
      const isPdf =
        (evidence.mime_type || "").includes("pdf") ||
        (evidence.filename || "").toLowerCase().endsWith(".pdf");
      if (isPdf) {
        return (
          <iframe
            src={signedUrl}
            width="100%"
            height="600px"
            style={{ border: "none", borderRadius: "8px" }}
            title="PDF Preview"
          />
        );
      }
      return (
        <p style={{ color: "var(--text-muted)", padding: "16px" }}>
          Preview not available for this document type. Use the Extracted Text tab.
        </p>
      );
    }

    return null;
  }

  function renderMetadataTab() {
    const meta = evidence.exif_metadata || evidence.media_metadata;
    const integrity = evidence.integrity_flag;
    const hasMeta = meta && Object.keys(meta).length > 0;

    if (!hasMeta && !integrity) {
      return <p style={emptyStyle}>No metadata extracted.</p>;
    }
    return (
      <>
        {hasMeta && (
          <div style={cardStyle}>
            {Object.entries(meta).map(([key, value]) => (
              <div
                key={key}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "8px 0",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span style={{ color: "var(--text-muted)", fontSize: "13px" }}>{key}</span>
                <span style={{ ...monoStyle, fontSize: "13px" }}>
                  {typeof value === "object" ? JSON.stringify(value) : String(value)}
                </span>
              </div>
            ))}
          </div>
        )}
        {integrity && integrity.flagged === true && (
          <div
            style={{
              marginTop: "16px",
              padding: "14px 16px",
              borderRadius: "var(--radius-md)",
              background: "rgba(245,158,11,0.12)",
              border: "1px solid var(--warning)",
              color: "var(--warning)",
              fontSize: "13px",
              display: "flex",
              alignItems: "flex-start",
              gap: "8px",
            }}
          >
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: "1px" }} />
            <span>Integrity Warning: {integrity.note}</span>
          </div>
        )}
        {integrity && integrity.flagged === false && (
          <div
            style={{
              marginTop: "16px",
              padding: "14px 16px",
              borderRadius: "var(--radius-md)",
              background: "rgba(16,185,129,0.12)",
              border: "1px solid var(--success)",
              color: "var(--success)",
              fontSize: "13px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <Shield size={16} />
            No integrity issues detected.
          </div>
        )}
      </>
    );
  }

  function renderExtractedTextTab() {
    if (evidence.xai_summary && evidence.xai_summary.includes('unsupported_format')) {
      return (
        <div style={{color:'var(--warning)', padding:16}}>
          ⚠ Old .doc format is not supported.
          Please convert this file to .docx and re-upload.
        </div>
      );
    }
    if (!evidence.extracted_text) {
      return <p style={emptyStyle}>No text extracted from this document.</p>;
    }
    return (
      <>
        {evidence.xai_summary && (
          <div
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: "12px 16px",
              marginBottom: "16px",
              fontSize: "13px",
              color: "var(--text-secondary)",
            }}
          >
            Extraction summary: {evidence.xai_summary}
          </div>
        )}
        <div
          style={{
            maxHeight: "400px",
            overflowY: "auto",
            background: "var(--bg-muted)",
            padding: "16px",
            borderRadius: "var(--radius-md)",
            fontFamily: "Inter, sans-serif",
            fontSize: "13px",
            lineHeight: 1.7,
            whiteSpace: "pre-wrap",
          }}
        >
          {evidence.extracted_text}
        </div>
      </>
    );
  }
  function renderJourneyTab() {
    if (journeyLoading) {
      return (
        <div style={{ display: "flex", justifyContent: "center", padding: "40px" }}>
          <Spinner size={24} />
        </div>
      );
    }

    const steps = journey?.steps || [];
    if (steps.length === 0) {
      return <p style={emptyStyle}>No provenance data yet.</p>;
    }

    const iconMap = {
      upload: { icon: Upload, color: "var(--accent)" },
      hash_computed: { icon: Hash, color: "var(--info)" },
      ai_analysis: { icon: Cpu, color: "var(--success)" },
      blockchain_anchored: { icon: Shield, color: "var(--success)" },
      contradiction_linked: { icon: GitMerge, color: "var(--warning)" },
      graph_linked: { icon: Share2, color: "var(--info)" },
      claim_linked: { icon: Link, color: "var(--accent)" },
    };

    return (
      <div style={{ position: "relative", paddingLeft: "40px" }}>
        {/* Vertical line */}
        <div
          style={{
            position: "absolute",
            left: "15px",
            top: "4px",
            bottom: "4px",
            width: "2px",
            background: "var(--border)",
          }}
        />
        {steps.map((step, idx) => {
          const mapping = iconMap[step.type] || { icon: Clock, color: "var(--text-muted)" };
          const IconComp = mapping.icon;
          const dotColor = step.status === "flagged" ? "var(--warning)" : mapping.color;
          return (
            <div key={idx} style={{ position: "relative", marginBottom: "24px" }}>
              <div
                style={{
                  position: "absolute",
                  left: "-33px",
                  top: "2px",
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  background: "var(--bg-surface)",
                  border: `2px solid ${dotColor}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <IconComp size={14} color={dotColor} />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: "14px" }}>{step.name}</div>
                <div style={{ color: "var(--text-secondary)", fontSize: "13px", marginTop: "2px" }}>
                  {step.description}
                </div>
                {step.timestamp && (
                  <div style={{ color: "var(--text-muted)", fontSize: "11px", marginTop: "4px", fontFamily: "'JetBrains Mono', monospace" }}>
                    {relativeTime(step.timestamp)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function renderLinkedClaimsTab() {
    if (claimsLoading) {
      return (
        <div style={{ display: "flex", justifyContent: "center", padding: "40px" }}>
          <Spinner size={24} />
        </div>
      );
    }

    const links = claimLinks?.links || [];

    if (links.length === 0) {
      return (
        <div style={{ textAlign: "center", padding: "40px" }}>
          <p style={{ color: "var(--text-secondary)", marginBottom: "16px" }}>No claim links found.</p>
          <button
            onClick={handleBuildClaims}
            disabled={buildingClaims}
            style={{
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: "var(--radius-sm)",
              padding: "10px 20px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: buildingClaims ? "wait" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            {buildingClaims && <Spinner size={14} />}
            {buildingClaims ? "Building..." : "Build Claim Links"}
          </button>
        </div>
      );
    }

    const supporting = links.filter((l) => l.link_type === "SUPPORTS");
    const contradicting = links.filter((l) => l.link_type === "CONTRADICTS");

    function renderLinkGroup(title, items, color) {
      if (items.length === 0) return null;
      return (
        <div style={{ marginBottom: "20px" }}>
          <h4 style={{ color, fontSize: "13px", fontWeight: 600, marginBottom: "10px" }}>
            {title} ({items.length})
          </h4>
          {items.map((link, idx) => (
            <div
              key={idx}
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                padding: "12px 16px",
                marginBottom: "8px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: "999px",
                    background: link.link_type === "SUPPORTS" ? "rgba(22,163,74,0.15)" : "rgba(220,38,38,0.15)",
                    color: link.link_type === "SUPPORTS" ? "var(--success)" : "var(--danger)",
                    fontSize: "10px",
                    fontWeight: 600,
                  }}
                >
                  {link.link_type}
                </span>
                <span style={{ fontSize: "13px", color: "var(--text-primary)" }}>
                  Witness: {link.witness_label || "Unknown"}
                </span>
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                Matched entity: "{link.entity_text}" via {link.match_source}
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace", marginTop: "4px" }}>
                Confidence: {((link.confidence || 0) * 100).toFixed(0)}%
              </div>
            </div>
          ))}
        </div>
      );
    }

    return (
      <>
        {renderLinkGroup("Supporting", supporting, "var(--success)")}
        {renderLinkGroup("Contradicting", contradicting, "var(--danger)")}
      </>
    );
  }

  function renderActiveTab() {
    switch (activeTab) {
      case "Journey":
        return renderJourneyTab();
      case "Linked Claims":
        return renderLinkedClaimsTab();
      case "Objects":
        return renderObjectsTab();
      case "OCR":
        return renderOcrTab();
      case "Scene":
        return renderSceneTab();
      case "XAI":
        return renderXaiTab();
      case "Blockchain":
        return renderBlockchainTab();
      case "Preview":
        return renderPreviewTab();
      case "Metadata":
        return renderMetadataTab();
      case "Extracted Text":
        return renderExtractedTextTab();
      default:
        return null;
    }
  }

  /* ─── Render ─── */

  return (
    <AppShell>
      <div style={{ maxWidth: "960px", margin: "0 auto" }}>
        {/* Header */}
        <button
          onClick={() => navigate(`/cases/${caseId}/evidence`)}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--accent)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            marginBottom: "20px",
            fontSize: "14px",
          }}
        >
          <ArrowLeft size={16} />
          Back to Evidence
        </button>

        <h1
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 700,
            fontSize: "28px",
            marginBottom: "12px",
          }}
        >
          {evidence.filename}
        </h1>

        <div style={{ display: "flex", gap: "10px", marginBottom: "28px" }}>
          <span
            style={{
              padding: "4px 12px",
              borderRadius: "999px",
              background: "rgba(59,130,246,.12)",
              color: "var(--accent)",
              fontSize: "12px",
              fontWeight: 600,
              textTransform: "capitalize",
            }}
          >
            {evidence.type}
          </span>
          <span
            style={{
              padding: "4px 12px",
              borderRadius: "999px",
              background: getStatusColor(evidence.status),
              color: "#fff",
              fontSize: "12px",
              fontWeight: 600,
            }}
          >
            {evidence.status}
          </span>
        </div>

        {/* Tab bar */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid var(--border)",
            marginBottom: "24px",
          }}
        >
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => handleTabChange(tab)}
              style={{
                background: "transparent",
                border: "none",
                borderBottom:
                  activeTab === tab
                    ? "2px solid var(--accent)"
                    : "2px solid transparent",
                color:
                  activeTab === tab
                    ? "var(--accent)"
                    : "var(--text-secondary)",
                padding: "12px 20px",
                fontSize: "14px",
                fontWeight: 500,
                cursor: "pointer",
                transition: "var(--transition)",
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ minHeight: "200px" }}>{renderActiveTab()}</div>
      </div>
    </AppShell>
  );
}
