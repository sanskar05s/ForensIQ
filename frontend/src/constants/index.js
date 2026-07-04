export const ROUTES = {
  LOGIN: "/login",

  CASES: "/cases",
  NEW_CASE: "/cases/new",

  CASE_DETAIL: "/cases/:caseId",

  EVIDENCE: "/cases/:caseId/evidence",
  NEW_EVIDENCE: "/cases/:caseId/evidence/new",
  EVIDENCE_DETAIL: "/cases/:caseId/evidence/:evidenceId",

  WITNESSES: "/cases/:caseId/witnesses",
  CONTRADICTIONS: "/cases/:caseId/contradictions",
  TIMELINE: "/cases/:caseId/timeline",
  KNOWLEDGE_GRAPH: "/cases/:caseId/knowledge-graph",
  ACTIVITY: "/cases/:caseId/activity",
  REPORT: "/cases/:caseId/report",
};
