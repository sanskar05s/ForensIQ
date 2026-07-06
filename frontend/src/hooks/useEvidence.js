import { useEffect, useState } from "react";
import { getEvidenceByCase } from "../supabase/db";

export function useEvidence(caseId) {
  const [evidence, setEvidence] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function fetchEvidence() {
    if (!caseId) return;

    try {
      setLoading(true);
      setError(null);

      const data = await getEvidenceByCase(caseId);
      setEvidence(data);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchEvidence();
  }, [caseId]);

  return {
    evidence,
    loading,
    error,
    refresh: fetchEvidence,
  };
}
