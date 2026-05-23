import { createPortalFileSignedUrl } from "../shared/signed-url";

export async function getPortalFileDownloadUrl(params: { token: string; fileId: string }) {
  return createPortalFileSignedUrl(params);
}
