import AppShell from "../components/layout/AppShell";
import { Link, useParams } from "react-router-dom";
import { ROUTES } from "../constants";

export default function EvidenceDetail() {
  const { caseId } = useParams();

  return (
    <AppShell>
      <div style={{ padding: "32px" }}>
        <h1>Evidence Detail</h1>

        <p>Evidence analysis results will appear here.</p>

        <Link to={`/cases/${caseId}`}>← Back to Case</Link>
      </div>
    </AppShell>
  );
}
