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
  CASE_BLOCKCHAIN: "/cases/:caseId/blockchain",
};

export const TABLES = {
  CASES: "cases",
};

export const PRIORITY = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical",
};

export const STATUS = {
  OPEN: "open",
  ACTIVE: "active",
  CLOSED: "closed",
};

export const THEME = {
  DARK: "dark",
  LIGHT: "light",
};

export const LOCAL_STORAGE_KEYS = {
  THEME: "forensiq-theme",
};

export const EVIDENCE_TYPES = {
  IMAGE: "image",
  DOCUMENT: "document",
  VIDEO: "video",
  AUDIO: "audio",
};

export const EVIDENCE_STATUS = {
  UPLOADED: "uploaded",
  ANALYZING: "analyzing",
  ANALYZED: "analyzed",
  FAILED: "failed",
};

export const CONFIDENCE_THRESHOLD = 0.7;

export const NODE_COLORS = {
  PERSON: "#3B82F6",
  LOCATION: "#10B981",
  TIME: "#8B5CF6",
  OBJECT: "#F59E0B",
  ORGANIZATION: "#EC4899",
  EVENT: "#06B6D4",
};
