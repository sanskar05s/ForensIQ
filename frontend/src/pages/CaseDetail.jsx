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
} from "lucide-react";

import { ROUTES } from "../constants";

import { useCaseDetail } from "../hooks/useCaseDetail";
import { useEvidence } from "../hooks/useEvidence";

import ModuleCard from "../components/case/ModuleCard";
import EvidenceCard from "../components/evidence/EvidenceCard";
import StaleBanner from "../components/case/StaleBanner";

import Spinner from "../components/loading/Spinner";
import SkeletonCard from "../components/loading/SkeletonCard";

import { apiClient } from "../api/client";
import { relativeTime } from "../utils/relativeTime";

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
  }, [caseId]);

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
      <div
        style={{
          padding: "40px",
        }}
      >
        <h2>Failed to load case.</h2>

        <button onClick={refresh}>Retry</button>
      </div>
    );
  }

  return (
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

      <div
        style={{
          display: "flex",
          gap: "12px",
          marginBottom: "18px",
        }}
      >
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

      <p
        style={{
          color: "var(--text-secondary)",
          marginBottom: "36px",
        }}
      >
        Investigator: {case_.investigator_name}
        {" • "}
        Created {relativeTime(case_.created_at)}
      </p>

      {/* Modules */}

      <h2
        style={{
          marginBottom: "20px",
        }}
      >
        Investigation Modules
      </h2>

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
          icon={<MessageSquare />}
          title="AI Assistant"
          description="Case investigation assistant."
        />

        <ModuleCard
          icon={<Activity />}
          title="Activity Log"
          description="Audit trail."
        />

        <ModuleCard
          icon={<FileText />}
          title="Report"
          description="Generate investigation reports."
        />
      </div>

      {/* Evidence Section starts here */}
      <h2
        style={{
          marginBottom: "20px",
        }}
      >
        Evidence
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
          <p
            style={{
              marginBottom: "18px",
            }}
          >
            No evidence uploaded yet.
          </p>

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
  );
}
