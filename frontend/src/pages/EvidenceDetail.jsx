import { useState, useEffect, useRef } from "react";
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
  Activity,
} from "lucide-react";

import AppShell from "../components/layout/AppShell";
import Spinner from "../components/loading/Spinner";
import { supabase } from "../supabase/client";
import { apiBlob, apiClient } from "../api/client";
import { relativeTime } from "../utils/relativeTime";

function DetectionCrop({ caseId, evidenceId, detectionIndex, alt, style }) {
  const [imageUrl, setImageUrl] = useState(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl;

    apiBlob(
      `/identification/cases/${caseId}/evidence/${evidenceId}/crop/${detectionIndex}`,
      { signal: controller.signal },
    )
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setImageUrl(objectUrl);
      })
      .catch((err) => {
        if (err.name !== "AbortError") setLoadError(true);
      });

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [caseId, evidenceId, detectionIndex]);

  if (!imageUrl) {
    return (
      <div
        role={loadError ? "img" : undefined}
        aria-label={loadError ? `${alt} unavailable` : undefined}
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-muted)",
          fontSize: 11,
        }}
      >
        {loadError ? "No preview" : "Loading preview…"}
      </div>
    );
  }

  return <img src={imageUrl} alt={alt} style={style} />;
}

const apiGet = async (endpoint) => {
  const res = await apiClient(endpoint);
  return { data: res, ...res };
};

const apiPost = async (endpoint, body) => {
  const res = await apiClient(endpoint, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return { data: res, ...res };
};

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

  /* VEI-2 Objects tab state */
  const [identifications, setIdentifications] = useState([]);
  const [overlayData, setOverlayData] = useState([]);
  const [loadingIdentifications, setLoadingIdentifications] = useState(false);

  /* Full image overlay modal state */
  const [overlayModal, setOverlayModal] = useState({
    open: false,
    selectedIndex: null,
    imageUrl: null,
  });
  const fullImgRef = useRef(null);
  const [imgDimensions, setImgDimensions] = useState({});

  /* Witness options for identification modal */
  const [witnessOptions, setWitnessOptions] = useState([]);

  /* Preview tab overlay states */
  const [previewSelectedDet, setPreviewSelectedDet] = useState(null);
  const previewImgRef = useRef(null);
  const [previewImgDims, setPreviewImgDims] = useState({});

  /* Identification modal state */
  const [idModal, setIdModal] = useState({
    open: false,
    detectionIndex: null,
    detectionLabel: "",
    canonicalName: "",
    alias: "",
    identifiedBy: "Investigator",
    source: "investigator",
    statementId: "",
    notes: "",
    saving: false,
  });

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
    if ((activeTab !== "objects" && activeTab !== "Objects") || !evidence?.id) return;
    setLoadingIdentifications(true);
    Promise.all([
      apiGet(`/identification/cases/${caseId}/evidence/${evidence.id}/overlay-data`),
      apiGet(`/identification/cases/${caseId}/evidence/${evidence.id}`),
    ])
      .then(([overlayRes, idRes]) => {
        setOverlayData(overlayRes.data?.overlay || overlayRes.overlay || []);
        setIdentifications(idRes.data?.identifications || idRes.identifications || []);
      })
      .catch((err) => {
        console.error("Failed to load identification data:", err);
      })
      .finally(() => setLoadingIdentifications(false));
  }, [activeTab, evidence?.id, caseId]);

  /* Fetch overlay data when Preview tab opens */
  useEffect(() => {
    if ((activeTab !== "preview" && activeTab !== "Preview") || !evidence?.id) return;
    if (!signedUrl && !urlLoading) {
      fetchSignedUrl();
    }
    apiGet(`/identification/cases/${caseId}/evidence/${evidence.id}/overlay-data`)
      .then((res) => setOverlayData(res.data?.overlay || res.overlay || []))
      .catch(() => {});
  }, [activeTab, evidence?.id, caseId]);

  const openFullImageOverlay = async (detIndex) => {
    let url = signedUrl;
    if (!url) {
      try {
        const res = await apiGet(
          `/blockchain/cases/${caseId}/evidence/${evidence.id}/signed-url`
        );
        url = res.data?.url || res.url;
      } catch (err) {
        console.error("Failed to get signed URL for overlay:", err);
      }
    }
    setOverlayModal({ open: true, selectedIndex: detIndex, imageUrl: url });
  };

  const openIdentificationModal = async (detIndex, label) => {
    const existing = identifications.find((id) => id.detection_index === detIndex);
    setIdModal({
      open: true,
      detectionIndex: detIndex,
      detectionLabel: label,
      canonicalName: existing?.canonical_name || "",
      alias: existing?.alias || "",
      identifiedBy: existing?.identified_by || "Investigator",
      source: (existing?.identified_by || "Investigator") === "Investigator" ? "investigator" : "witness",
      statementId: existing?.statement_id || "",
      notes: existing?.notes || "",
      saving: false,
    });
    // Fetch witness labels for dropdown
    try {
      const res = await apiGet(`/witness/cases/${caseId}/statements`);
      const stmts = res.data?.statements || res.statements || [];
      const labels = [...new Set(stmts.map((s) => s.witness_label).filter(Boolean))];
      setWitnessOptions(labels);
    } catch {
      setWitnessOptions([]);
    }
  };

  const saveIdentification = async () => {
    if (!idModal.canonicalName.trim()) return;
    setIdModal((m) => ({ ...m, saving: true }));
    const inferredSource =
      idModal.identifiedBy === "Investigator" ? "investigator" : "witness";
    try {
      await apiPost(
        `/identification/cases/${caseId}/evidence/${evidence.id}`,
        {
          detection_index: idModal.detectionIndex,
          canonical_name: idModal.canonicalName.trim(),
          alias: idModal.alias?.trim() || null,
          identified_by: idModal.identifiedBy,
          identification_source: inferredSource,
          statement_id: null,
          notes: idModal.notes?.trim() || null,
        }
      );
      // Refresh identifications and overlay data
      const [idRes, overlayRes] = await Promise.all([
        apiGet(`/identification/cases/${caseId}/evidence/${evidence.id}`),
        apiGet(`/identification/cases/${caseId}/evidence/${evidence.id}/overlay-data`),
      ]);
      setIdentifications(idRes.data?.identifications || idRes.identifications || []);
      setOverlayData(overlayRes.data?.overlay || overlayRes.overlay || []);
      setIdModal((m) => ({ ...m, open: false }));
    } catch (err) {
      console.error("Failed to save identification:", err);
    } finally {
      setIdModal((m) => ({ ...m, saving: false }));
    }
  };

  useEffect(() => {
    fetchEvidence();
  }, [caseId, evidenceId]);

  async function fetchEvidence() {
    if (!caseId || !evidenceId) return;
    setLoading(true);
    try {
      const res = await apiClient(`/evidence/cases/${caseId}`);
      const list = res.data?.evidence || res.evidence || [];
      const item = list.find((e) => String(e.id) === String(evidenceId));
      if (!item) throw new Error("Evidence not found");

      setEvidence(item);

      const tabs = TABS_BY_TYPE[item.type] || ["Blockchain"];
      setActiveTab((prev) => prev || tabs[0]);
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
    } catch (err) {
      console.error('Provenance fetch error:', err);
      setJourney({ steps: [], journey: [] });
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

    return (
      <>
        {/* Objects Tab */}
        {detections.map((det, i) => {
          const detIndex = det.detection_index ?? i;
          const overlayDet = overlayData.find((o) => o.detection_index === detIndex);
          const detIdentifications = identifications.filter(
            (id) => id.detection_index === detIndex
          );
          const isIdentified = detIdentifications.length > 0;

          return (
            <div
              key={detIndex}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 8,
                overflow: "hidden",
                background: "var(--bg-elevated)",
                marginBottom: 12,
              }}
            >
              {/* Crop thumbnail with fullscreen button */}
              <div
                style={{
                  width: "100%",
                  height: 120,
                  background: "var(--bg-muted)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  position: "relative",
                  cursor: "pointer",
                }}
                onClick={() => openFullImageOverlay(detIndex)}
              >
                <DetectionCrop
                  caseId={caseId}
                  evidenceId={evidence.id}
                  detectionIndex={detIndex}
                  alt={`${det.label} detection`}
                  style={{
                    maxWidth: "100%",
                    maxHeight: "100%",
                    objectFit: "contain",
                  }}
                />

                {/* Fullscreen icon — top right of thumbnail */}
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    openFullImageOverlay(detIndex);
                  }}
                  style={{
                    position: "absolute",
                    top: 6,
                    right: 6,
                    width: 24,
                    height: 24,
                    background: "rgba(0,0,0,0.55)",
                    borderRadius: 4,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    color: "#fff",
                  }}
                  title="View in full image"
                >
                  {/* Maximize icon — 4 corner arrows */}
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="15 3 21 3 21 9" />
                    <polyline points="9 21 3 21 3 15" />
                    <line x1="21" y1="3" x2="14" y2="10" />
                    <line x1="3" y1="21" x2="10" y2="14" />
                  </svg>
                </div>
              </div>

              {/* Detection info */}
              <div style={{ padding: "10px 12px" }}>
                {/* AI detection header */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 6,
                  }}
                >
                  <div>
                    <span
                      style={{
                        fontSize: 11,
                        color: "var(--text-muted)",
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                        display: "block",
                        marginBottom: 2,
                      }}
                    >
                      AI detected
                    </span>
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: 14,
                        color: "var(--text-primary)",
                        textTransform: "capitalize",
                      }}
                    >
                      {det.label}
                    </span>
                  </div>
                  <span
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 12,
                      color:
                        det.confidence >= 0.7
                          ? "var(--success)"
                          : "var(--warning)",
                      fontWeight: 600,
                    }}
                  >
                    {Math.round(det.confidence * 100)}%
                  </span>
                </div>

                {/* Human identifications */}
                {isIdentified ? (
                  <div
                    style={{
                      marginTop: 8,
                      padding: "8px",
                      background: "var(--accent-dim, rgba(37,99,235,0.15))",
                      borderRadius: 6,
                      borderLeft: "3px solid var(--accent)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--accent)",
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                        marginBottom: 4,
                        fontWeight: 600,
                      }}
                    >
                      Human identification
                    </div>
                    {detIdentifications.map((ident, j) => (
                      <div
                        key={j}
                        style={{
                          marginBottom:
                            j < detIdentifications.length - 1 ? 6 : 0,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "var(--text-primary)",
                          }}
                        >
                          {ident.canonical_name}
                          {ident.alias && (
                            <span
                              style={{
                                fontSize: 11,
                                color: "var(--text-muted)",
                                marginLeft: 6,
                              }}
                            >
                              ({ident.alias})
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--text-secondary)",
                            marginTop: 2,
                          }}
                        >
                          Identified by: {ident.identified_by}
                          <span
                            style={{
                              marginLeft: 6,
                              padding: "1px 6px",
                              borderRadius: 4,
                              background: "var(--bg-muted)",
                              fontSize: 10,
                              textTransform: "capitalize",
                            }}
                          >
                            {ident.identification_source}
                          </span>
                        </div>
                        {ident.notes && (
                          <div
                            style={{
                              fontSize: 11,
                              color: "var(--text-muted)",
                              marginTop: 2,
                              fontStyle: "italic",
                            }}
                          >
                            {ident.notes}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-muted)",
                      marginTop: 6,
                      fontStyle: "italic",
                    }}
                  >
                    Not identified
                  </div>
                )}

                {/* Action buttons */}
                <div style={{ marginTop: 10 }}>
                  <button
                    onClick={() => openIdentificationModal(detIndex, det.label)}
                    style={{
                      width: "100%",
                      padding: "7px 0",
                      fontSize: 11,
                      background: isIdentified
                        ? "transparent"
                        : "var(--accent-dim, rgba(37,99,235,0.15))",
                      border: `1px solid ${
                        isIdentified ? "var(--border)" : "var(--accent)"
                      }`,
                      borderRadius: 6,
                      color: isIdentified
                        ? "var(--text-muted)"
                        : "var(--accent)",
                      cursor: "pointer",
                    }}
                  >
                    {isIdentified ? "Edit Identification" : "Add Identification"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {/* Full image overlay modal */}
        {overlayModal.open && (
          <div
            onClick={() =>
              setOverlayModal({
                open: false,
                selectedIndex: null,
                imageUrl: null,
              })
            }
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 9998,
              background: "rgba(0,0,0,0.85)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "relative",
                maxWidth: "90vw",
                maxHeight: "85vh",
              }}
            >
              {/* Original image */}
              <img
                src={overlayModal.imageUrl}
                alt="Evidence"
                ref={fullImgRef}
                onLoad={() => {
                  if (fullImgRef.current) {
                    setImgDimensions({
                      w: fullImgRef.current.naturalWidth,
                      h: fullImgRef.current.naturalHeight,
                      dw: fullImgRef.current.width,
                      dh: fullImgRef.current.height,
                    });
                  }
                }}
                style={{
                  display: "block",
                  maxWidth: "90vw",
                  maxHeight: "85vh",
                }}
              />

              {/* SVG overlay for bounding boxes */}
              {imgDimensions.dw && (
                <svg
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: imgDimensions.dw,
                    height: imgDimensions.dh,
                  }}
                  viewBox={`0 0 ${imgDimensions.dw} ${imgDimensions.dh}`}
                >
                  {overlayData.map((det) => {
                    if (!det.bbox || det.bbox.length < 4) return null;
                    const isSelected =
                      det.detection_index === overlayModal.selectedIndex;
                    const scaleX = imgDimensions.dw / imgDimensions.w;
                    const scaleY = imgDimensions.dh / imgDimensions.h;

                    // Handle both normalized and absolute bbox
                    const [bx1, by1, bx2, by2] = det.bbox;
                    const isNorm =
                      bx1 <= 1 && by1 <= 1 && bx2 <= 1 && by2 <= 1;
                    const rx = isNorm ? bx1 * imgDimensions.dw : bx1 * scaleX;
                    const ry = isNorm ? by1 * imgDimensions.dh : by1 * scaleY;
                    const rw = isNorm
                      ? (bx2 - bx1) * imgDimensions.dw
                      : (bx2 - bx1) * scaleX;
                    const rh = isNorm
                      ? (by2 - by1) * imgDimensions.dh
                      : (by2 - by1) * scaleY;

                    const detIdent = identifications.filter(
                      (id) => id.detection_index === det.detection_index
                    );
                    const identName =
                      detIdent[0]?.canonical_name ||
                      det.identifications?.[0]?.canonical_name;

                    return (
                      <g
                        key={det.detection_index}
                        onClick={() =>
                          setOverlayModal((m) => ({
                            ...m,
                            selectedIndex: det.detection_index,
                          }))
                        }
                        style={{ cursor: "pointer" }}
                      >
                        <rect
                          x={rx}
                          y={ry}
                          width={rw}
                          height={rh}
                          fill="none"
                          stroke={
                            isSelected ? "#3B82F6" : "rgba(255,255,255,0.35)"
                          }
                          strokeWidth={isSelected ? 3 : 1}
                          rx={3}
                        />
                        {isSelected && (
                          <text
                            x={rx + 4}
                            y={ry > 20 ? ry - 6 : ry + 16}
                            fill="#3B82F6"
                            fontSize={12}
                            fontFamily="JetBrains Mono"
                          >
                            {det.label} {Math.round(det.confidence * 100)}%
                            {identName ? ` • ${identName}` : ""}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              )}

              {/* Close button */}
              <button
                onClick={() =>
                  setOverlayModal({
                    open: false,
                    selectedIndex: null,
                    imageUrl: null,
                  })
                }
                style={{
                  position: "absolute",
                  top: 8,
                  right: 8,
                  background: "rgba(0,0,0,0.7)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "50%",
                  width: 28,
                  height: 28,
                  cursor: "pointer",
                  fontSize: 16,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* Identification modal */}
        {idModal.open && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 9999,
              background: "rgba(0,0,0,0.7)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                background: "var(--bg-surface)",
                borderRadius: 12,
                padding: 24,
                width: 400,
                border: "1px solid var(--border)",
              }}
            >
              {/* Header */}
              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    fontFamily: "'Space Grotesk', sans-serif",
                  }}
                >
                  Add Human Identification
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-muted)",
                    marginTop: 4,
                  }}
                >
                  AI detected: <strong>{idModal.detectionLabel}</strong>
                  <br />
                  This supplements the AI detection — it does not replace it.
                  The original witness statement will NOT be modified.
                </div>
              </div>

              {/* Form fields */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <label>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-muted)",
                      marginBottom: 4,
                    }}
                  >
                    Name / Identifier *
                  </div>
                  <input
                    value={idModal.canonicalName}
                    onChange={(e) =>
                      setIdModal((m) => ({
                        ...m,
                        canonicalName: e.target.value,
                      }))
                    }
                    placeholder="e.g. Rahul Sharma, Black Scorpio, Victim's bag"
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 6,
                      fontSize: 13,
                      background: "var(--bg-elevated)",
                      color: "var(--text-primary)",
                      border: "1px solid var(--border)",
                    }}
                  />
                </label>

                <label>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-muted)",
                      marginBottom: 4,
                    }}
                  >
                    Alias (optional)
                  </div>
                  <input
                    value={idModal.alias}
                    onChange={(e) =>
                      setIdModal((m) => ({ ...m, alias: e.target.value }))
                    }
                    placeholder="e.g. Rahul"
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 6,
                      fontSize: 13,
                      background: "var(--bg-elevated)",
                      color: "var(--text-primary)",
                      border: "1px solid var(--border)",
                    }}
                  />
                </label>

                <label>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-muted)",
                      marginBottom: 4,
                    }}
                  >
                    Identified by *
                  </div>
                  <select
                    value={idModal.identifiedBy}
                    onChange={(e) => {
                      const val = e.target.value;
                      setIdModal((m) => ({
                        ...m,
                        identifiedBy: val,
                        // Auto-set source based on selection
                        source: val === "Investigator" ? "investigator" : "witness",
                      }));
                    }}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 6,
                      fontSize: 13,
                      background: "var(--bg-muted)",
                      border: "1px solid var(--border)",
                      color: "var(--text-primary)",
                    }}
                  >
                    <option value="Investigator">Investigator</option>
                    {witnessOptions.map((label) => (
                      <option key={label} value={label}>
                        {label}
                      </option>
                    ))}
                    {idModal.identifiedBy &&
                      idModal.identifiedBy !== "Investigator" &&
                      !witnessOptions.includes(idModal.identifiedBy) && (
                        <option value={idModal.identifiedBy}>
                          {idModal.identifiedBy}
                        </option>
                      )}
                  </select>
                </label>

                <label>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-muted)",
                      marginBottom: 4,
                    }}
                  >
                    Notes (optional)
                  </div>
                  <textarea
                    value={idModal.notes}
                    onChange={(e) =>
                      setIdModal((m) => ({ ...m, notes: e.target.value }))
                    }
                    placeholder="Optional annotation..."
                    rows={2}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 6,
                      fontSize: 13,
                      background: "var(--bg-elevated)",
                      color: "var(--text-primary)",
                      border: "1px solid var(--border)",
                    }}
                  />
                </label>
              </div>

              {/* Forensic disclaimer */}
              <div
                style={{
                  marginTop: 12,
                  padding: "8px 10px",
                  background: "var(--bg-muted)",
                  borderRadius: 6,
                  fontSize: 11,
                  color: "var(--text-muted)",
                }}
              >
                ⚠ This identification supplements the AI detection. It is stored as a
                separate investigation record. The AI did NOT identify{" "}
                {idModal.canonicalName || "this object"}.
              </div>

              {/* Buttons */}
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button
                  onClick={() => setIdModal((m) => ({ ...m, open: false }))}
                  style={{
                    flex: 1,
                    padding: "8px 0",
                    background: "var(--bg-muted)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontSize: 13,
                    color: "var(--text-primary)",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={saveIdentification}
                  disabled={
                    idModal.saving ||
                    !idModal.canonicalName.trim()
                  }
                  style={{
                    flex: 1,
                    padding: "8px 0",
                    background: "var(--accent)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontSize: 13,
                    opacity:
                      idModal.saving ||
                      !idModal.canonicalName.trim() ||
                      !idModal.identifiedBy.trim()
                        ? 0.6
                        : 1,
                  }}
                >
                  {idModal.saving ? "Saving..." : "Save Identification"}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
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
        <div style={{ width: "100%" }}>
          {/* Full image with SVG bounding box overlay */}
          <div style={{ position: "relative", width: "100%" }}>
            <img
              ref={previewImgRef}
              src={signedUrl}
              alt={evidence.filename}
              onLoad={() => {
                const el = previewImgRef.current;
                if (!el) return;
                setPreviewImgDims({
                  naturalW: el.naturalWidth,
                  naturalH: el.naturalHeight,
                  displayW: el.width,
                  displayH: el.height,
                });
              }}
              style={{ display: "block", maxWidth: "100%", width: "100%", borderRadius: "8px" }}
            />

            {/* SVG bounding box overlay */}
            {previewImgDims.displayW > 0 && overlayData.length > 0 && (
              <svg
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: previewImgDims.displayW,
                  height: previewImgDims.displayH,
                  pointerEvents: "all",
                }}
                viewBox={`0 0 ${previewImgDims.displayW} ${previewImgDims.displayH}`}
              >
                {overlayData.map((det) => {
                  if (!det.bbox || det.bbox.length < 4) return null;
                  const isSelected = previewSelectedDet?.detection_index === det.detection_index;
                  const isNorm = det.bbox.every((v) => v >= 0 && v <= 1);
                  const [bx1, by1, bx2, by2] = det.bbox;
                  const scaleX = previewImgDims.displayW / previewImgDims.naturalW;
                  const scaleY = previewImgDims.displayH / previewImgDims.naturalH;

                  const rx = isNorm ? bx1 * previewImgDims.displayW : bx1 * scaleX;
                  const ry = isNorm ? by1 * previewImgDims.displayH : by1 * scaleY;
                  const rw = isNorm
                    ? (bx2 - bx1) * previewImgDims.displayW
                    : (bx2 - bx1) * scaleX;
                  const rh = isNorm
                    ? (by2 - by1) * previewImgDims.displayH
                    : (by2 - by1) * scaleY;

                  return (
                    <g
                      key={det.detection_index}
                      onClick={() =>
                        setPreviewSelectedDet(isSelected ? null : det)
                      }
                      style={{ cursor: "pointer" }}
                    >
                      <rect
                        x={rx}
                        y={ry}
                        width={rw}
                        height={rh}
                        fill={isSelected ? "rgba(59,130,246,0.08)" : "transparent"}
                        stroke={
                          isSelected
                            ? "#3B82F6"
                            : det.is_identified
                            ? "#10B981"
                            : "rgba(255,255,255,0.5)"
                        }
                        strokeWidth={isSelected ? 2.5 : 1.5}
                        rx={3}
                      />
                      {/* Label above bbox */}
                      <text
                        x={rx + 4}
                        y={ry > 16 ? ry - 5 : ry + rh + 14}
                        fill={
                          isSelected
                            ? "#3B82F6"
                            : det.is_identified
                            ? "#10B981"
                            : "rgba(255,255,255,0.85)"
                        }
                        fontSize={10}
                        fontFamily="JetBrains Mono, monospace"
                        style={{ pointerEvents: "none" }}
                      >
                        {det.label}
                        {det.is_identified
                          ? ` • ${det.identifications?.[0]?.canonical_name || ""}`
                          : ` ${Math.round(det.confidence * 100)}%`}
                      </text>
                    </g>
                  );
                })}
              </svg>
            )}
          </div>

          {/* Legend */}
          {overlayData.length > 0 && (
            <div
              style={{
                marginTop: 8,
                display: "flex",
                gap: 12,
                fontSize: 10,
                color: "var(--text-muted)",
                fontFamily: "JetBrains Mono, monospace",
              }}
            >
              <span>── Detected</span>
              <span style={{ color: "#10B981" }}>── Identified</span>
              <span style={{ color: "#3B82F6" }}>── Selected</span>
            </div>
          )}

          {/* Selected detection detail panel - repositioned below image */}
          {previewSelectedDet && (
            <div
              style={{
                marginTop: 14,
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                padding: "16px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    AI detected
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: "var(--text-primary)",
                      marginTop: 2,
                      textTransform: "capitalize",
                    }}
                  >
                    {previewSelectedDet.label}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color:
                        previewSelectedDet.confidence >= 0.7
                          ? "var(--success)"
                          : "var(--warning)",
                      fontFamily: "JetBrains Mono, monospace",
                      marginTop: 2,
                    }}
                  >
                    {Math.round(previewSelectedDet.confidence * 100)}% confidence
                  </div>
                </div>
                <button
                  onClick={() => setPreviewSelectedDet(null)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    fontSize: 18,
                    lineHeight: 1,
                    padding: "4px",
                  }}
                  title="Close panel"
                >
                  ×
                </button>
              </div>

              {/* Human identifications */}
              {previewSelectedDet.identifications?.length > 0 ? (
                <div
                  style={{
                    marginTop: 12,
                    paddingTop: 10,
                    borderTop: "1px solid var(--border)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--success)",
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                      marginBottom: 6,
                      fontWeight: 600,
                    }}
                  >
                    Human identification
                  </div>
                  {previewSelectedDet.identifications.map((id, j) => (
                    <div key={j} style={{ marginBottom: 6 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "var(--text-primary)",
                        }}
                      >
                        {id.canonical_name}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                        {id.identified_by} · {id.identification_source}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  style={{
                    marginTop: 10,
                    fontSize: 12,
                    color: "var(--text-muted)",
                    fontStyle: "italic",
                  }}
                >
                  Not identified
                </div>
              )}

              {/* Quick "Add ID" / "Edit ID" button */}
              <div style={{ marginTop: 12 }}>
                <button
                  onClick={() => {
                    const detIndex = previewSelectedDet.detection_index;
                    const detLabel = previewSelectedDet.label;
                    setPreviewSelectedDet(null);
                    openIdentificationModal(detIndex, detLabel);
                  }}
                  style={{
                    padding: "6px 14px",
                    fontSize: 12,
                    background: "var(--accent-dim, rgba(37,99,235,0.12))",
                    border: "1px solid var(--accent)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--accent)",
                    cursor: "pointer",
                    fontWeight: 500,
                  }}
                >
                  {previewSelectedDet.is_identified ? "Edit Identification" : "Add Identification"}
                </button>
              </div>
            </div>
          )}
        </div>
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

    // Accept both "steps" (frontend expectation) and "journey" (backend key)
    const steps = journey?.steps || journey?.journey || [];
    if (steps.length === 0) {
      return <p style={emptyStyle}>No provenance data yet.</p>;
    }

    return (
      <div style={{ position: "relative" }}>
        {steps.map((step, idx) => {
          // Backend returns: { step, description, timestamp, icon, status }
          // Frontend expected: { name, type, description, timestamp, status }
          // Normalize: accept both formats
          const stepTitle = step.name || step.step || "Step";
          const stepIcon = step.type || step.icon || "Activity";
          const stepDesc = step.description || "";
          const stepTime = step.timestamp;
          const stepStatus = step.status || "complete";

          // Icon mapping (backend returns Lucide icon names directly)
          const IconComponent =
            {
              Upload: Upload,
              Hash: Hash,
              Cpu: Cpu,
              Shield: Shield,
              GitMerge: GitMerge,
              Share2: Share2,
              Link: Link,
              upload: Upload, // lowercase fallback
              hash: Hash,
              cpu: Cpu,
              shield: Shield,
              gitmerge: GitMerge,
              share2: Share2,
              link: Link,
              // type-based mapping (if frontend sends type instead of icon)
              hash_computed: Hash,
              analysis: Cpu,
              blockchain: Shield,
              contradiction: GitMerge,
              knowledge_graph: Share2,
              claim: Link,
            }[stepIcon] || Activity;

          const isConflict = stepStatus === "flagged";

          return (
            <div
              key={idx}
              style={{
                display: "flex",
                gap: 12,
                padding: "8px 0",
                borderBottom: "1px solid var(--border)",
                alignItems: "flex-start",
              }}
            >
              {/* Icon circle */}
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: isConflict ? "#D9770622" : "var(--accent-dim)",
                  color: isConflict ? "#D97706" : "var(--accent)",
                }}
              >
                <IconComponent size={16} />
              </div>

              {/* Content */}
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--text-primary)",
                  }}
                >
                  {stepTitle}
                </div>
                {stepDesc && (
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-secondary)",
                      marginTop: 2,
                    }}
                  >
                    {stepDesc}
                  </div>
                )}
                {stepTime && (
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--text-muted)",
                      fontFamily: "'JetBrains Mono', monospace",
                      marginTop: 3,
                    }}
                  >
                    {relativeTime(stepTime)}
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

    const supporting = links.filter((l) =>
      (l.link_type || '').toLowerCase() === "supports");
    const contradicting = links.filter((l) =>
      (l.link_type || '').toLowerCase() === "contradicts");
    const unresolved = links.filter((l) =>
      (l.link_type || '').toLowerCase() === "unresolved");

    function renderLinkGroup(title, items, color) {
      if (items.length === 0) return (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>
          No {title?.toLowerCase() || 'matching'} claims found.
        </p>
      );
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
                    background:
                      (link.link_type || "").toLowerCase() === "supports"
                        ? "rgba(22,163,74,0.15)"
                        : "rgba(220,38,38,0.15)",
                    color:
                      (link.link_type || "").toLowerCase() === "supports"
                        ? "var(--success)"
                        : "var(--danger)",
                    fontSize: "10px",
                    fontWeight: 600,
                  }}
                >
                  {(link.link_type || "").toUpperCase()}
                </span>
                <span style={{ fontSize: "13px", color: "var(--text-primary)" }}>
                  Witness: {link.witness_label || link.statement?.witness_label || "Unknown"}
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

        <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
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

        {/* Priority Ranking Section */}
        {evidence.priority && (
          <div
            style={{
              padding: "12px 16px",
              background: "var(--bg-elevated)",
              borderRadius: 8,
              border: "1px solid var(--border)",
              marginTop: 12,
              marginBottom: 24,
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                fontFamily: "'JetBrains Mono', monospace",
                marginBottom: 8,
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              Evidence Priority
            </div>

            {/* Priority badge + score */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span
                style={{
                  padding: "3px 10px",
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: 700,
                  fontFamily: "'JetBrains Mono', monospace",
                  background: (() => {
                    const p = (evidence.priority || "").toUpperCase();
                    if (p === "CRITICAL") return "#DC262622";
                    if (p === "HIGH") return "#D9770622";
                    if (p === "MEDIUM") return "#0284C722";
                    return "#6B728022";
                  })(),
                  color: (() => {
                    const p = (evidence.priority || "").toUpperCase();
                    if (p === "CRITICAL") return "#DC2626";
                    if (p === "HIGH") return "#D97706";
                    if (p === "MEDIUM") return "#0284C7";
                    return "#6B7280";
                  })(),
                }}
              >
                {(evidence.priority || "LOW").toUpperCase()}
              </span>
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 20,
                  fontWeight: 700,
                  color: "var(--text-primary)",
                }}
              >
                {evidence.priority_score ?? 0}
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  /100
                </span>
              </span>
            </div>

            {/* Breakdown bar */}
            {evidence.priority_breakdown && (
              <div style={{ marginTop: 10 }}>
                {Object.entries({
                  "AI Confidence": {
                    score: evidence.priority_breakdown.analysis_confidence ?? 0,
                    max: 30,
                  },
                  Blockchain: {
                    score: evidence.priority_breakdown.blockchain ?? 0,
                    max: 20,
                  },
                  Detections: {
                    score: evidence.priority_breakdown.detections ?? 0,
                    max: 15,
                  },
                  Contradictions: {
                    score:
                      evidence.priority_breakdown.contradiction_involvement ??
                      0,
                    max: 20,
                  },
                  "KG Centrality": {
                    score: evidence.priority_breakdown.kg_centrality ?? 0,
                    max: 15,
                  },
                }).map(([label, { score, max }]) => (
                  <div
                    key={label}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        width: 100,
                        color: "var(--text-muted)",
                        fontFamily: "'JetBrains Mono', monospace",
                      }}
                    >
                      {label}
                    </span>
                    <div
                      style={{
                        flex: 1,
                        height: 4,
                        background: "var(--bg-muted)",
                        borderRadius: 2,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${max > 0 ? Math.min((score / max) * 100, 100) : 0}%`,
                          background: "var(--accent)",
                          borderRadius: 2,
                        }}
                      />
                    </div>
                    <span
                      style={{
                        fontSize: 10,
                        width: 32,
                        textAlign: "right",
                        fontFamily: "'JetBrains Mono', monospace",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {score}/{max}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

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
