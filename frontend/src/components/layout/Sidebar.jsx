import {
  Briefcase,
  Image,
  Users,
  GitMerge,
  Clock,
  Share2,
  FileText,
  LogOut,
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

        <div style={{ ...itemStyle, ...disabledStyle }}>
          <Image size={18} />
          Evidence
          <span style={{ marginLeft: "auto", fontSize: 11 }}>SOON</span>
        </div>

        {caseId ? (
          <Link
            to={`/cases/${caseId}/witnesses`}
            style={itemStyle}
          >
            <Users size={18} />
            Witnesses
          </Link>
        ) : (
          <div style={{ ...itemStyle, ...disabledStyle }}>
            <Users size={18} />
            Witnesses
            <span style={{ marginLeft: "auto", fontSize: 11 }}>SOON</span>
          </div>
        )}

        {caseId ? (
          <Link
            to={`/cases/${caseId}/contradictions`}
            style={itemStyle}
          >
            <GitMerge size={18} />
            Contradictions
          </Link>
        ) : (
          <div style={{ ...itemStyle, ...disabledStyle }}>
            <GitMerge size={18} />
            Contradictions
            <span style={{ marginLeft: "auto", fontSize: 11 }}>SOON</span>
          </div>
        )}

        <div style={{ ...itemStyle, ...disabledStyle }}>
          <Clock size={18} />
          Timeline
          <span style={{ marginLeft: "auto", fontSize: 11 }}>SOON</span>
        </div>

        <div style={{ ...itemStyle, ...disabledStyle }}>
          <Share2 size={18} />
          Knowledge Graph
          <span style={{ marginLeft: "auto", fontSize: 11 }}>SOON</span>
        </div>

        <div style={{ ...itemStyle, ...disabledStyle }}>
          <FileText size={18} />
          Reports
          <span style={{ marginLeft: "auto", fontSize: 11 }}>SOON</span>
        </div>
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
