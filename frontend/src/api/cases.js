import { supabase } from "../supabase/client";

export async function getUserCases(userId) {
  const { data, error } = await supabase
    .from("cases")
    .select("*")
    .eq("created_by", userId)
    .order("created_at", { ascending: false });

  return { data, error };
}
