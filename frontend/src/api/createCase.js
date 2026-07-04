import { supabase } from "../supabase/client";

export async function createCase(caseData) {
  return await supabase.from("cases").insert([caseData]).select().single();
}
