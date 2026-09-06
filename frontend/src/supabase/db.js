import { supabase } from "./client";
import { TABLES } from "../constants";
import { parseSupabaseError } from "../utils/supabaseErrors";

function attachEvidenceCounts(rows, evidenceRows = []) {
  if (!Array.isArray(rows)) return rows;

  const counts = {};
  for (const row of evidenceRows || []) {
    const caseId = row.case_id;
    counts[caseId] = (counts[caseId] || 0) + 1;
  }

  return rows.map((row) => ({
    ...row,
    evidence_count: counts[row.id] ?? Number(row.evidence_count || 0),
  }));
}

export async function getCases() {
  const { data, error } = await supabase
    .from(TABLES.CASES)
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return {
      data: [],
      error: parseSupabaseError(error),
    };
  }

  const { data: evidenceRows, error: evidenceError } = await supabase
    .from("evidence")
    .select("case_id");

  if (evidenceError) {
    return {
      data: attachEvidenceCounts(data || []),
      error: parseSupabaseError(evidenceError),
    };
  }

  return {
    data: attachEvidenceCounts(data || [], evidenceRows || []),
    error: null,
  };
}

export async function getCaseById(caseId) {
  const { data, error } = await supabase
    .from(TABLES.CASES)
    .select("*")
    .eq("id", caseId)
    .single();

  if (error) {
    return {
      data: null,
      error: parseSupabaseError(error),
    };
  }

  const { data: evidenceRows, error: evidenceError } = await supabase
    .from("evidence")
    .select("id")
    .eq("case_id", caseId);

  const safeData = data ? { ...data } : null;

  if (safeData) {
    safeData.evidence_count = evidenceError
      ? Number(safeData.evidence_count || 0)
      : (evidenceRows || []).length;
  }

  return {
    data: safeData,
    error: evidenceError ? parseSupabaseError(evidenceError) : null,
  };
}

export async function createCase(caseData) {
  const { data, error } = await supabase
    .from(TABLES.CASES)
    .insert(caseData)
    .select()
    .single();

  return {
    data,
    error: error ? parseSupabaseError(error) : null,
  };
}

export async function updateCase(caseId, updates) {
  const { data, error } = await supabase
    .from(TABLES.CASES)
    .update(updates)
    .eq("id", caseId)
    .select()
    .single();

  return {
    data,
    error: error ? parseSupabaseError(error) : null,
  };
}

export async function getEvidenceByCase(caseId) {
  const { data, error } = await supabase
    .from("evidence")
    .select("*")
    .eq("case_id", caseId)
    .order("uploaded_at", { ascending: false });

  if (error) throw error;

  return data;
}

export async function createEvidence(evidenceData) {
  const { data, error } = await supabase
    .from("evidence")
    .insert(evidenceData)
    .select()
    .single();

  if (error) throw error;

  return data;
}
