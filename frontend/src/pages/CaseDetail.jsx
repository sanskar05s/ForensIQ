import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  ArrowLeft,
  Image,
  Users,
  GitMerge,
  Clock,
  Share2,
  MessageSquare,
  Activity,
  FileText,
  Shield,
  CheckCircle,
  Circle,
} from "lucide-react";

import { ROUTES } from "../constants";

import { useCaseDetail } from "../hooks/useCaseDetail";
import { useEvidence } from "../hooks/useEvidence";

import ModuleCard from "../components/case/ModuleCard";
import EvidenceCard from "../components/evidence/EvidenceCard";
import StaleBanner from "../components/case/StaleBanner";
import AppShell from "../components/layout/AppShell";
import AssistantPanel from "../components/assistant/AssistantPanel";

import Spinner from "../components/loading/Spinner";
import SkeletonCard from "../components/loading/SkeletonCard";

import { apiClient } from "../api/client";
import { relativeTime } from "../utils/relativeTime";

const mono = { fontFamily: "'JetBrains Mono', monospace" };

export default function CaseDetail() {
  const { caseId } = useParams();
  const navigate = useNavigate();

  const { case_, loading, error, refresh } = useCaseDetail(caseId);
  const { evidence, loading: evidenceLoading } = useEvidence(caseId);

  const [staleModules, setStaleModules] = useState([]);
  const [staleDismissed, setStaleDismissed] = useState(false);
  const [contradictionCount, setContradictionCount] = useState(0);
  const [timelineCount, setTimelineCount] = useState(0);
  const [graphNodeCount, setGraphNodeCount] = useState(0);
  const [blockchainAudit, setBlockchainAudit] = useState(null);

  // M7-C additions
  const [activityCount, setActivityCount] = useState(0);
  const [reportStatus, setReportStatus] = useState(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [aiUpdate, setAiUpdate] = useState(null);

  useEffect(() => {
    if (!caseId) return;
    const stale = [];
    const checkStale = async () => {
      try {
        const r1 = await apiClient(`/contradiction/cases/${caseId}/staleness`);
        if (r1.stale) stale.push("contradictions");
      } catch {}
      try {
        const r2 = await apiClient(`/timeline/cases/${caseId}/staleness`);
        if (r2.stale) stale.push("timeline");
      } catch {}
      try {
        const r3 = await apiClient(`/graph/cases/${caseId}/staleness`);
        if (r3.stale) stale.push("graph");
      } catch {}
      setStaleModules(stale);
    };
    checkStale();
    apiClient(`/contradiction/cases/${caseId}`)
      .then((res) => setContradictionCount((res.contradictions || []).length))
      .catch(() => {});
    apiClient(`/timeline/cases/${caseId}`)
      .then((res) => setTimelineCount((res.events || []).length))
      .catch(() => {});
    apiClient(`/graph/cases/${caseId}`)
      .then((res) => setGraphNodeCount((res.nodes || []).length))
      .catch(() => {});
    apiClient(`/blockchain/cases/${caseId}/audit`)
      .then((res) => setBlockchainAudit(res.summary || null))
      .catch(() => {});
    // M7-C fetches
    apiClient(`/activity/cases/${caseId}`)
      .then((res) => setActivityCount((res.activities || []).length))
      .catch(() => {});
    apiClient(`/report/cases/${caseId}`)
      .then((res) => setReportStatus(res.report?.status || null))
      .catch(() => {});
  }, [caseId]);

  // Auto-dismiss AI update after 30s
  useEffect(() => {
    if (!aiUpdate) return;
    const t = setTimeout(() => setAiUpdate(null), 30000);
    return () => clearTimeout(t);
  }, [aiUpdate]);

  // Completeness calculation
  const completionSteps = case_
    ? [
        { label: "Evidence", done: (case_.evidence_count || 0) > 0 },
        { label: "Statements", done: (case_.witness_count || 0) > 0 },
        { label: "Contradictions", done: contradictionCount > 0 },
        { label: "Timeline", done: timelineCount > 0 },
        { label: "Graph", done: graphNodeCount > 0 },
        { label: "Report", done: reportStatus === "ready" },
      ]
    : [];
  const completionPercent = completionSteps.length
    ? Math.round(
        (completionSteps.filter((s) => s.done).length / completionSteps.length) * 100
      )
    : 0;

  function reportBadge() {
    if (reportStatus === "ready") return { label: "READY", color: "var(--success)" };
    if (reportStatus === "generating") return { label: "GENERATING", color: "var(--warning)" };
    return { label: "Not started", color: "var(--text-muted)" };
  }

  if (loading) {
    return (
      <div
        style={{
          minHeight: "60vh",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Spinner />
      </div>
    );
  }

  if (error || !case_) {
    return (
      <div style={{ padding: "40px" }}>
        <h2>Failed to load case.</h2>
        <button onClick={refresh}>Retry</button>
      </div>
    );
  }

  return (
    <AppShell>
      <div>
        {staleModules.length > 0 && !staleDismissed && (
          <StaleBanner
            caseId={caseId}
            staleModules={staleModules}
            onDismiss={() => setStaleDismissed(true)}
          />
        )}

        {/* Header */}
        <button
          onClick={() => navigate(ROUTES.CASES)}
          style={{
            border: "none",
            background: "transparent",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "24px",
            color: "var(--accent)",
          }}
        >
          <ArrowLeft size={18} />
          All Cases
        </button>

        <h1
          style={{
            fontSize: "32px",
            marginBottom: "14px",
            color: "var(--text-primary)",
          }}
        >
          {case_.title}
        </h1>

        <div style={{ display: "flex", gap: "12px", marginBottom: "18px" }}>
          <span
            style={{
              padding: "6px 12px",
              borderRadius: "999px",
              background: "rgba(59,130,246,.15)",
            }}
          >
            {case_.priority}
          </span>
          <span
            style={{
              padding: "6px 12px",
              borderRadius: "999px",
              background: "rgba(34,197,94,.15)",
            }}
          >
            {case_.status}
          </span>
        </div>

        <p style={{ color: "var(--text-secondary)", marginBottom: "24px" }}>
          Investigator: {case_.investigator_name}
          {" • "}
          Created {relativeTime(case_.created_at)}
        </p>

        {/* Case Completeness */}
        <div
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            padding: "16px 20px",
            marginBottom: "28px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            {completionSteps.map((step, i) => (
              <div key={step.label} style={{ display: "flex", alignItems: "center" }}>
                {i > 0 && (
                  <div
                    style={{
                      width: "24px",
                      height: "2px",
                      background: step.done ? "var(--success)" : "var(--border)",
                    }}
                  />
                )}
                <div style={{ textAlign: "center" }}>
                  {step.done ? (
                    <CheckCircle size={18} color="var(--success)" />
                  ) : (
                    <Circle size={18} color="var(--text-muted)" />
                  )}
                  <div
                    style={{
                      fontSize: "10px",
                      color: step.done ? "var(--success)" : "var(--text-muted)",
                      marginTop: "4px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {step.label}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ ...mono, fontSize: "13px", color: "var(--text-secondary)" }}>
            {completionPercent}% Complete
          </div>
        </div>

        {/* Modules */}
        <h2 style={{ marginBottom: "20px" }}>Investigation Modules</h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
            gap: "18px",
            marginBottom: "42px",
          }}
        >
          <ModuleCard
            icon={<Image />}
            title="Evidence"
            description="Upload and manage evidence."
            active
            onClick={() => navigate(`/cases/${caseId}/evidence/new`)}
          />

          <ModuleCard
            icon={<Users />}
            title="Witnesses"
            description={`${case_.witness_count || 0} statements`}
            active
            onClick={() => navigate(`/cases/${caseId}/witnesses`)}
          />

          <ModuleCard
            icon={<GitMerge />}
            title="Contradictions"
            description={`${contradictionCount} contradiction(s) found`}
            active
            onClick={() => navigate(`/cases/${caseId}/contradictions`)}
          />

          <ModuleCard
            icon={<Clock />}
            title="Timeline"
            description={`${timelineCount} events`}
            active
            onClick={() => navigate(`/cases/${caseId}/timeline`)}
          />

          <ModuleCard
            icon={<Share2 />}
            title="Knowledge Graph"
            description={`${graphNodeCount} entities`}
            active
            onClick={() => navigate(`/cases/${caseId}/knowledge-graph`)}
          />

          <ModuleCard
            icon={<Shield />}
            title="Evidence Integrity"
            description={
              blockchainAudit
                ? `${blockchainAudit.blockchain_anchored} / ${blockchainAudit.total_evidence} verified`
                : "Blockchain audit"
            }
            active
            onClick={() => navigate(`/cases/${caseId}/blockchain`)}
          />

          <ModuleCard
            icon={<MessageSquare />}
            title="AI Assistant"
            description="Ask AI"
            active
            onClick={() => setAssistantOpen(true)}
          />

          <ModuleCard
            icon={<Activity />}
            title="Activity Log"
            description={`${activityCount} events`}
            active
            onClick={() => navigate(`/cases/${caseId}/activity`)}
          />

          <ModuleCard
            icon={<FileText />}
            title="Report"
            description={
              <span style={{ color: reportBadge().color, fontWeight: 600, fontSize: "12px" }}>
                {reportBadge().label}
              </span>
            }
            active
            onClick={() => navigate(`/cases/${caseId}/report`)}
          />
        </div>

        {/* Evidence Section */}
        <h2 style={{ marginBottom: "20px" }}>Evidence</h2>

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
            <p style={{ marginBottom: "18px" }}>No evidence uploaded yet.</p>
            <button
              onClick={() => navigate(`/cases/${caseId}/evidence/new`)}
              style={{
                padding: "10px 18px",
                border: "none",
                borderRadius: "8px",
                background: "var(--accent)",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              Upload First Evidence
            </button>
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

      {/* AI Assistant Panel */}
      <AssistantPanel
        caseId={caseId}
        isOpen={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        updateText={aiUpdate}
        onDismissUpdate={() => setAiUpdate(null)}
      />

      {/* Floating Ask AI button */}
      {!assistantOpen && (
        <button
          onClick={() => setAssistantOpen(true)}
          style={{
            position: "fixed",
            bottom: "32px",
            right: "32px",
            background: "var(--accent)",
            color: "#fff",
            border: "none",
            borderRadius: "999px",
            padding: "12px 20px",
            fontSize: "14px",
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            boxShadow: "var(--shadow-md)",
            zIndex: 900,
            transition: "var(--transition)",
          }}
        >
          <MessageSquare size={18} />
          Ask AI
        </button>
      )}

      {/* AI update toast (when panel is closed) */}
      {aiUpdate && !assistantOpen && (
        <div
          onClick={() => setAssistantOpen(true)}
          style={{
            position: "fixed",
            bottom: "80px",
            right: "32px",
            background: "var(--bg-elevated)",
            border: "1px solid var(--warning)",
            borderRadius: "var(--radius-md)",
            padding: "10px 16px",
            fontSize: "12px",
            color: "var(--text-primary)",
            cursor: "pointer",
            boxShadow: "var(--shadow-md)",
            zIndex: 900,
            maxWidth: "280px",
          }}
        >
          AI update available — click Ask AI
        </div>
      )}
    </AppShell>
  );
}
