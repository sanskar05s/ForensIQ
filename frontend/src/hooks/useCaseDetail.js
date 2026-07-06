import { useEffect, useState } from "react";
import { getCaseById } from "../supabase/db";

export function useCaseDetail(caseId) {
  const [case_, setCase] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchCase = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error } = await getCaseById(caseId);

      if (error) throw error;

      setCase(data);
    } catch (err) {
      console.error(err);
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (caseId) {
      fetchCase();
    }
  }, [caseId]);

  return {
    case_,
    loading,
    error,
    refresh: fetchCase,
  };
}
