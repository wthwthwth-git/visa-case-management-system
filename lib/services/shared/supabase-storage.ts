import { createClient } from "@supabase/supabase-js";

export type StorageSignedUrlInput = {
  bucket: string;
  path: string;
  expiresInSeconds: number;
};

function getSupabaseStorageClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function createStorageSignedUrl(input: StorageSignedUrlInput): Promise<string> {
  const supabase = getSupabaseStorageClient();

  const { data, error } = await supabase.storage
    .from(input.bucket)
    .createSignedUrl(input.path, input.expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error("Failed to create storage signed URL.");
  }

  return data.signedUrl;
}

export async function downloadStorageObject(input: {
  bucket: string;
  path: string;
}): Promise<Uint8Array> {
  const supabase = getSupabaseStorageClient();
  const { data, error } = await supabase.storage.from(input.bucket).download(input.path);

  if (error || !data) {
    throw new Error("Failed to download storage object.");
  }

  return new Uint8Array(await data.arrayBuffer());
}
