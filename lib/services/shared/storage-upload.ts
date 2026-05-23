import { createClient } from "@supabase/supabase-js";

export type StorageUploadInput = {
  bucket: string;
  path: string;
  body: ArrayBuffer | Uint8Array;
  mimeType: string;
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

export function getStorageBucketName() {
  const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim();

  if (!bucket) {
    throw new Error("SUPABASE_STORAGE_BUCKET is required.");
  }

  return bucket;
}

export async function uploadToStorage(input: StorageUploadInput): Promise<void> {
  const supabase = getSupabaseStorageClient();
  const { error } = await supabase.storage.from(input.bucket).upload(input.path, input.body, {
    contentType: input.mimeType,
    upsert: false,
  });

  if (error) {
    throw new Error("Failed to upload file to storage.");
  }
}

export async function deleteStorageObject(input: {
  bucket: string;
  path: string;
}): Promise<void> {
  const supabase = getSupabaseStorageClient();
  const { error } = await supabase.storage.from(input.bucket).remove([input.path]);

  if (error) {
    throw new Error("Failed to delete storage object.");
  }
}
