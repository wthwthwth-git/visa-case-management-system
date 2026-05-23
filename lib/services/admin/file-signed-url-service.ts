import { createAdminFileSignedUrl, type SignedUrlResult } from "../shared/signed-url";

export async function getAdminFileDownloadUrl(input: {
  fileId: string;
}): Promise<SignedUrlResult> {
  return createAdminFileSignedUrl(input);
}
