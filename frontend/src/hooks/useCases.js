import { useEffect, useState } from "react";
import { getCases } from "../supabase/db";

export function useCases() {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchCases = async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await getCases();

    if (error) {
      setError(error);
      setCases([]);
    } else {
      setCases(data || []);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchCases();
  }, []);

  return {
    cases,
    loading,
    error,
    refreshCases: fetchCases,
  };
}
