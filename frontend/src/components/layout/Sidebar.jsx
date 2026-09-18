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
  Shield,
  MessageSquare,
} from "lucide-react";

import { Link, useNavigate, useParams } from "react-router-dom";
import { ROUTES } from "../../constants";
import { useAuth } from "../../hooks/useAuth";

export default function Sidebar() {
  const { signOut } = useAuth();
  const { caseId } = useParams();
  const navigate = useNavigate();

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

  const buttonItemStyle = {
    ...itemStyle,
    width: "100%",
    border: "none",
    background: "transparent",
    fontSize: "14px",
    cursor: "pointer",
    textAlign: "left",
  };

  function handleOpenAssistant() {
    if (!caseId) return;
    window.dispatchEvent(new CustomEvent("open-ai-assistant"));
    navigate(`/cases/${caseId}?assistant=open`);
  }

  return (
    <aside
      style={{
        width: "240px",
        background: "var(--bg-surface)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        flexShrink: 0,
        height: "100%",
        overflowY: "auto",
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

        {/* 1. Evidence */}
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

        {/* 2. Witnesses */}
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

        {/* 3. Contradictions */}
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

        {/* 4. Timeline */}
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

        {/* 5. Knowledge Graph */}
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

        {/* 6. Evidence Integrity */}
        {caseId ? (
          <Link to={`/cases/${caseId}/blockchain`} style={itemStyle}>
            <Shield size={18} />
            Evidence Integrity
          </Link>
        ) : (
          <div style={{ ...itemStyle, ...disabledStyle }}>
            <Shield size={18} />
            Evidence Integrity
          </div>
        )}

        {/* 7. Investigation Leads */}
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

        {/* 8. Hypothesis Analyzer */}
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

        {/* 9. Report */}
        {caseId ? (
          <Link to={`/cases/${caseId}/report`} style={itemStyle}>
            <FileText size={18} />
            Report
          </Link>
        ) : (
          <div style={{ ...itemStyle, ...disabledStyle }}>
            <FileText size={18} />
            Report
          </div>
        )}

        {/* 10. AI Assistant */}
        {caseId ? (
          <button onClick={handleOpenAssistant} style={buttonItemStyle}>
            <MessageSquare size={18} />
            AI Assistant
          </button>
        ) : (
          <div style={{ ...itemStyle, ...disabledStyle }}>
            <MessageSquare size={18} />
            AI Assistant
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
