import { supabase } from "./client";
import { TABLES } from "../constants";
import { parseSupabaseError } from "../utils/supabaseErrors";

export async function getCases() {
  const { data, error } = await supabase
    .from(TABLES.CASES)
    .select("*")
    .order("created_at", { ascending: false });

  return {
    data,
    error: error ? parseSupabaseError(error) : null,
  };
}

export async function getCaseById(caseId) {
  const { data, error } = await supabase
    .from(TABLES.CASES)
    .select("*")
    .eq("id", caseId)
    .single();

  return {
    data,
    error: error ? parseSupabaseError(error) : null,
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
