import { supabase } from "./client";

const BUCKET = "evidence";

export async function uploadEvidence(caseId, file) {
  const fileName = `${caseId}/${Date.now()}-${file.name}`;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(fileName, file);

  if (error) {
    console.error("Storage Upload Error:", error);
    return { data: null, error };
  }

  return { data, error: null };
}

export async function deleteEvidence(path) {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);

  return { error };
}

export async function getSignedUrl(path) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 3600);

  return { data, error };
}
