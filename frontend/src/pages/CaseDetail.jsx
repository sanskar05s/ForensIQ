import { useState, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

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
  AlertCircle,
  FlaskConical,
} from "lucide-react";

import { ROUTES } from "../constants";

import { useCaseDetail } from "../hooks/useCaseDetail";

import ModuleCard from "../components/case/ModuleCard";
import StaleBanner from "../components/case/StaleBanner";
import AppShell from "../components/layout/AppShell";
import AssistantPanel from "../components/assistant/AssistantPanel";

import Spinner from "../components/loading/Spinner";

import { apiClient } from "../api/client";
import { relativeTime } from "../utils/relativeTime";

const mono = { fontFamily: "'JetBrains Mono', monospace" };

export default function CaseDetail() {
  const { caseId } = useParams();
  const navigate = useNavigate();

  const { case_, loading, error, refresh } = useCaseDetail(caseId);

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

  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get("assistant") === "open") {
      setAssistantOpen(true);
    }
    const handleOpenAssistant = () => setAssistantOpen(true);
    window.addEventListener("open-ai-assistant", handleOpenAssistant);
    return () =>
      window.removeEventListener("open-ai-assistant", handleOpenAssistant);
  }, [searchParams]);

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

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "14px",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <h1
            style={{
              fontSize: "32px",
              margin: 0,
              color: "var(--text-primary)",
            }}
          >
            {case_.title}
          </h1>

          <button
            onClick={() => navigate(`/cases/${caseId}/activity`)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 16px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
              background: "var(--bg-surface)",
              color: "var(--text-primary)",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 500,
              transition: "var(--transition)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--accent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
            }}
          >
            <Activity size={16} color="var(--accent)" />
            Activity Log ({activityCount})
          </button>
        </div>

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

        <p style={{ color: "var(--text-secondary)", marginBottom: "28px" }}>
          Investigator: {case_.investigator_name}
          {" • "}
          Created {relativeTime(case_.created_at)}
        </p>

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
          {/* 1. Evidence */}
          <ModuleCard
            icon={<Image />}
            title="Evidence"
            description={`${case_.evidence_count || 0} items — Upload and manage evidence.`}
            active
            onClick={() => navigate(`/cases/${caseId}/evidence`)}
          />

          {/* 2. Witnesses */}
          <ModuleCard
            icon={<Users />}
            title="Witnesses"
            description={`${case_.witness_count || 0} statements`}
            active
            onClick={() => navigate(`/cases/${caseId}/witnesses`)}
          />

          {/* 3. Contradictions */}
          <ModuleCard
            icon={<GitMerge />}
            title="Contradictions"
            description={`${contradictionCount} contradiction(s) found`}
            active
            onClick={() => navigate(`/cases/${caseId}/contradictions`)}
          />

          {/* 4. Timeline */}
          <ModuleCard
            icon={<Clock />}
            title="Timeline"
            description={`${timelineCount} events`}
            active
            onClick={() => navigate(`/cases/${caseId}/timeline`)}
          />

          {/* 5. Knowledge Graph */}
          <ModuleCard
            icon={<Share2 />}
            title="Knowledge Graph"
            description={`${graphNodeCount} entities`}
            active
            onClick={() => navigate(`/cases/${caseId}/knowledge-graph`)}
          />

          {/* 6. Evidence Integrity */}
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

          {/* 7. Investigation Leads */}
          <ModuleCard
            icon={<AlertCircle />}
            title="Investigation Leads"
            description="AI-identified evidence gaps"
            active
            onClick={() => navigate(`/cases/${caseId}/leads`)}
          />

          {/* 8. Hypothesis Analyzer */}
          <ModuleCard
            icon={<FlaskConical />}
            title="Hypothesis Analyzer"
            description="Test theories against evidence"
            active
            onClick={() => navigate(`/cases/${caseId}/hypotheses`)}
          />

          {/* 9. Report */}
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

          {/* 10. AI Assistant */}
          <ModuleCard
            icon={<MessageSquare />}
            title="AI Assistant"
            description="Ask AI"
            active
            onClick={() => setAssistantOpen(true)}
          />
        </div>
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
