import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../api/client";

export function useEvidence(caseId) {
  const [evidence, setEvidence] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchEvidence = useCallback(async ({ showLoading = false } = {}) => {
    if (!caseId) return;

    try {
      if (showLoading) setLoading(true);
      setError(null);

      const result = await apiClient(`/evidence/cases/${caseId}`);
      const data = result.data?.evidence || result.evidence || [];
      setEvidence(data);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    fetchEvidence({ showLoading: true });
  }, [caseId, fetchEvidence]);

  const hasEvidenceProcessing = evidence.some(
    (item) =>
      ["image", "document"].includes(item.type) &&
      ["uploaded", "analyzing"].includes(item.status),
  );

  useEffect(() => {
    if (!hasEvidenceProcessing) return undefined;

    let cancelled = false;
    let timeoutId;
    const poll = async () => {
      await fetchEvidence();
      if (!cancelled) timeoutId = window.setTimeout(poll, 2000);
    };
    timeoutId = window.setTimeout(poll, 2000);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [fetchEvidence, hasEvidenceProcessing]);

  return {
    evidence,
    loading,
    error,
    refresh: fetchEvidence,
  };
}
