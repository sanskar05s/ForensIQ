import {
  Briefcase,
  Image,
  Users,
  GitMerge,
  Clock,
  Share2,
  FileText,
  LogOut,
  FlaskConical,
  AlertCircle,
} from "lucide-react";

import { Link } from "react-router-dom";
import { useParams } from "react-router-dom";
import { ROUTES } from "../../constants";
import { useAuth } from "../../hooks/useAuth";

export default function Sidebar() {
  const { signOut } = useAuth();
  const { caseId } = useParams();

  const disabledStyle = {
    opacity: 0.45,
    cursor: "not-allowed",
  };

  const itemStyle = {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "12px 18px",
    textDecoration: "none",
    color: "var(--text-primary)",
    borderLeft: "3px solid transparent",
  };

  return (
    <aside
      style={{
        width: "240px",
        background: "var(--bg-surface)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <div>
        <Link
          to={ROUTES.CASES}
          style={{
            ...itemStyle,
            borderLeft: "3px solid var(--accent)",
            background: "rgba(37,99,235,.08)",
          }}
        >
          <Briefcase size={18} />
          Cases
        </Link>

        {caseId ? (
          <Link to={`/cases/${caseId}/evidence`} style={itemStyle}>
            <Image size={18} />
            Evidence
          </Link>
        ) : (
          <div style={{ ...itemStyle, ...disabledStyle }}>
            <Image size={18} />
            Evidence
          </div>
        )}

        {caseId ? (
          <Link to={`/cases/${caseId}/witnesses`} style={itemStyle}>
            <Users size={18} />
            Witnesses
          </Link>
        ) : (
          <div style={{ ...itemStyle, ...disabledStyle }}>
            <Users size={18} />
            Witnesses
          </div>
        )}

        {caseId ? (
          <Link to={`/cases/${caseId}/contradictions`} style={itemStyle}>
            <GitMerge size={18} />
            Contradictions
          </Link>
        ) : (
          <div style={{ ...itemStyle, ...disabledStyle }}>
            <GitMerge size={18} />
            Contradictions
          </div>
        )}

        {caseId ? (
          <Link to={`/cases/${caseId}/timeline`} style={itemStyle}>
            <Clock size={18} />
            Timeline
          </Link>
        ) : (
          <div style={{ ...itemStyle, ...disabledStyle }}>
            <Clock size={18} />
            Timeline
          </div>
        )}

        {caseId ? (
          <Link to={`/cases/${caseId}/knowledge-graph`} style={itemStyle}>
            <Share2 size={18} />
            Knowledge Graph
          </Link>
        ) : (
          <div style={{ ...itemStyle, ...disabledStyle }}>
            <Share2 size={18} />
            Knowledge Graph
          </div>
        )}

        {caseId ? (
          <Link to={`/cases/${caseId}/hypotheses`} style={itemStyle}>
            <FlaskConical size={18} />
            Hypothesis Analyzer
          </Link>
        ) : (
          <div style={{ ...itemStyle, ...disabledStyle }}>
            <FlaskConical size={18} />
            Hypothesis Analyzer
          </div>
        )}

        {caseId ? (
          <Link to={`/cases/${caseId}/leads`} style={itemStyle}>
            <AlertCircle size={18} />
            Investigation Leads
          </Link>
        ) : (
          <div style={{ ...itemStyle, ...disabledStyle }}>
            <AlertCircle size={18} />
            Investigation Leads
          </div>
        )}

        {caseId ? (
          <Link to={`/cases/${caseId}/report`} style={itemStyle}>
            <FileText size={18} />
            Reports
          </Link>
        ) : (
          <div style={{ ...itemStyle, ...disabledStyle }}>
            <FileText size={18} />
            Reports
          </div>
        )}
      </div>

      <button
        onClick={signOut}
        aria-label="Sign out"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "16px 18px",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          color: "var(--text-primary)",
          borderTop: "1px solid var(--border)",
        }}
      >
        <LogOut size={18} />
        Sign Out
      </button>
    </aside>
  );
}
