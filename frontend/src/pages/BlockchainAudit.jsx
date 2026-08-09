import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Clock,
  ExternalLink,
  ArrowLeft,
  RefreshCw,
  Link2,
} from "lucide-react";

import AppShell from "../components/layout/AppShell";
import Spinner from "../components/loading/Spinner";
import SkeletonCard from "../components/loading/SkeletonCard";
import { apiClient } from "../api/client";

const mono = { fontFamily: "'JetBrains Mono', monospace" };

function truncate(str, len) {
  if (!str) return "—";
  return str.length > len ? str.slice(0, len) + "..." : str;
}

/* ── Status badge ── */
function StatusBadge({ status }) {
  const config = {
    VERIFIED: { icon: <ShieldCheck size={14} />, color: "var(--success)", bg: "rgba(22,163,74,0.12)", label: "VERIFIED" },
    HASH_ONLY: { icon: <Clock size={14} />, color: "var(--warning)", bg: "rgba(202,138,4,0.12)", label: "HASH ONLY" },
    PENDING: { icon: <Clock size={14} />, color: "var(--danger)", bg: "rgba(220,38,38,0.12)", label: "PENDING" },
  };
  const c = config[status] || config.PENDING;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "3px 10px", borderRadius: "999px", background: c.bg, color: c.color, fontSize: "11px", fontWeight: 600 }}>
      {c.icon} {c.label}
    </span>
  );
}

/* ── Type badge ── */
function TypeBadge({ type }) {
  return (
    <span style={{ padding: "2px 8px", borderRadius: "999px", background: "rgba(59,130,246,0.12)", color: "var(--accent)", fontSize: "11px", fontWeight: 600, textTransform: "capitalize" }}>
      {type}
    </span>
  );
}

export default function BlockchainAudit() {
  const { caseId } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});
  const [verifyResults, setVerifyResults] = useState({});

  useEffect(() => { fetchAudit(); }, [caseId]);

  async function fetchAudit() {
    setLoading(true);
    try {
      const res = await apiClient(`/blockchain/cases/${caseId}/audit`);
      setData(res);
    } catch { setData(null); }
    finally { setLoading(false); }
  }

  async function handleVerify(evidenceId) {
    setActionLoading(prev => ({ ...prev, [evidenceId]: "verify" }));
    try {
      const res = await apiClient(`/blockchain/cases/${caseId}/evidence/${evidenceId}/verify`);
      setVerifyResults(prev => ({ ...prev, [evidenceId]: res.verified ? "CONFIRMED" : "COMPROMISED" }));
      setTimeout(() => setVerifyResults(prev => { const n = { ...prev }; delete n[evidenceId]; return n; }), 8000);
    } catch {
      setVerifyResults(prev => ({ ...prev, [evidenceId]: "ERROR" }));
    } finally {
      setActionLoading(prev => ({ ...prev, [evidenceId]: null }));
    }
  }

  async function handleAnchor(evidenceId, sha256) {
    setActionLoading(prev => ({ ...prev, [evidenceId]: "anchor" }));
    try {
      await apiClient("/blockchain/write", { method: "POST", body: JSON.stringify({ evidence_id: evidenceId, sha256 }) });
      await fetchAudit();
    } catch { /* toast error */ }
    finally { setActionLoading(prev => ({ ...prev, [evidenceId]: null })); }
  }

  /* ── Loading ── */
  if (loading) {
    return (
      <AppShell>
        <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
          <SkeletonCard /><SkeletonCard /><SkeletonCard />
        </div>
      </AppShell>
    );
  }

  const summary = data?.summary || {};
  const evidence = data?.evidence || [];

  /* ── Empty ── */
  if (evidence.length === 0) {
    return (
      <AppShell>
        <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
          <button onClick={() => navigate(`/cases/${caseId}`)} style={{ background: "transparent", border: "none", color: "var(--accent)", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", marginBottom: "20px", fontSize: "14px" }}>
            <ArrowLeft size={16} /> Back to Case
          </button>
          <div style={{ textAlign: "center", padding: "80px 20px", color: "var(--text-muted)" }}>
            <Shield size={48} style={{ marginBottom: "16px", opacity: 0.5 }} />
            <h2 style={{ marginBottom: "8px", color: "var(--text-primary)" }}>No evidence uploaded yet.</h2>
            <p>Upload evidence to begin generating blockchain certificates.</p>
          </div>
        </div>
      </AppShell>
    );
  }

  const pct = summary.completion_percent || 0;

  return (
    <AppShell>
      <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
        {/* Header */}
        <button onClick={() => navigate(`/cases/${caseId}`)} style={{ background: "transparent", border: "none", color: "var(--accent)", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", marginBottom: "20px", fontSize: "14px" }}>
          <ArrowLeft size={16} /> Back to Case
        </button>

        <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: "28px", marginBottom: "6px" }}>
          Evidence Integrity
        </h1>
        <p style={{ color: "var(--text-secondary)", marginBottom: "28px", fontSize: "14px" }}>
          SHA-256 hashes and Sepolia testnet certificates
        </p>

        {/* Summary Card */}
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "24px", marginBottom: "28px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "20px" }}>
            {[
              { label: "Total Evidence", value: summary.total_evidence, color: "var(--text-primary)" },
              { label: "Blockchain Anchored", value: summary.blockchain_anchored, color: summary.blockchain_anchored === summary.total_evidence ? "var(--success)" : "var(--text-primary)" },
              { label: "Hash Only", value: (summary.hashed || 0) - (summary.blockchain_anchored || 0), color: ((summary.hashed || 0) - (summary.blockchain_anchored || 0)) > 0 ? "var(--warning)" : "var(--text-primary)" },
              { label: "Pending", value: summary.pending, color: summary.pending > 0 ? "var(--danger)" : "var(--text-primary)" },
            ].map(s => (
              <div key={s.label} style={{ textAlign: "center" }}>
                <div style={{ ...mono, fontSize: "28px", fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          <div style={{ background: "var(--bg-muted)", borderRadius: "999px", height: "8px", overflow: "hidden", marginBottom: "8px" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: "var(--success)", borderRadius: "999px", transition: "width 0.5s ease" }} />
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
            {pct}% of evidence blockchain-verified
          </div>
        </div>

        {/* Evidence Audit Table */}
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
          {/* Table header */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 0.8fr 1.5fr 1.5fr 0.9fr 1fr", gap: "12px", padding: "12px 20px", borderBottom: "1px solid var(--border)", fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            <span>Filename</span><span>Type</span><span>SHA-256</span><span>Sepolia Tx</span><span>Status</span><span>Actions</span>
          </div>

          {/* Rows */}
          {evidence.map(ev => (
            <div key={ev.id} style={{ display: "grid", gridTemplateColumns: "2fr 0.8fr 1.5fr 1.5fr 0.9fr 1fr", gap: "12px", padding: "14px 20px", borderBottom: "1px solid var(--border)", alignItems: "center", fontSize: "13px" }}>
              {/* Filename */}
              <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={ev.filename}>
                {truncate(ev.filename, 40)}
              </span>

              {/* Type */}
              <span><TypeBadge type={ev.type} /></span>

              {/* SHA-256 */}
              <span style={{ ...mono, fontSize: "12px", color: ev.file_hash ? "var(--text-secondary)" : "var(--text-muted)" }}>
                {ev.file_hash ? truncate(ev.file_hash, 16) : "—"}
              </span>

              {/* Sepolia Tx */}
              <span>
                {ev.blockchain_tx_hash ? (
                  <a href={`https://sepolia.etherscan.io/tx/${ev.blockchain_tx_hash}`} target="_blank" rel="noopener noreferrer" style={{ ...mono, fontSize: "12px", color: "var(--accent)", display: "inline-flex", alignItems: "center", gap: "3px", textDecoration: "none" }}>
                    {truncate(ev.blockchain_tx_hash, 14)} <ExternalLink size={11} />
                  </a>
                ) : (
                  <span style={{ ...mono, fontSize: "12px", color: "var(--text-muted)" }}>—</span>
                )}
              </span>

              {/* Status */}
              <span><StatusBadge status={ev.blockchain_status} /></span>

              {/* Actions */}
              <span>
                {actionLoading[ev.id] ? (
                  <Spinner size={14} />
                ) : ev.blockchain_status === "VERIFIED" ? (
                  <>
                    <button onClick={() => handleVerify(ev.id)} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "4px 10px", fontSize: "11px", color: "var(--text-secondary)", cursor: "pointer" }}>
                      <RefreshCw size={11} style={{ marginRight: "3px" }} />Re-verify
                    </button>
                    {verifyResults[ev.id] && (
                      <div style={{ marginTop: "4px", fontSize: "10px", fontWeight: 600, color: verifyResults[ev.id] === "CONFIRMED" ? "var(--success)" : "var(--danger)" }}>
                        {verifyResults[ev.id] === "CONFIRMED" ? "✓ INTEGRITY CONFIRMED" : "✗ COMPROMISED"}
                      </div>
                    )}
                  </>
                ) : ev.file_hash ? (
                  <button onClick={() => handleAnchor(ev.id, ev.file_hash)} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "4px 10px", fontSize: "11px", color: "var(--accent)", cursor: "pointer", display: "inline-flex", alignItems: "center" }}>
                    <Link2 size={11} style={{ marginRight: "3px" }} />Anchor
                  </button>
                ) : (
                  <span title="No SHA-256 hash — re-upload this evidence to compute hash" style={{ fontSize: "11px", color: "var(--text-muted)", cursor: "help", borderBottom: "1px dashed var(--text-muted)" }}>
                    No hash
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
