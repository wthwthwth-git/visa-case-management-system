export type StoragePathInput = {
  caseId: string;
  requirementId: string;
  documentFileId: string;
  extension: string;
};

function normalizeExtension(extension: string) {
  const value = extension.trim().replace(/^\.+/u, "").toLowerCase();

  if (!/^[a-z0-9]{1,12}$/u.test(value)) {
    return "bin";
  }

  return value;
}

export function buildDocumentFileStoragePath(input: StoragePathInput) {
  const extension = normalizeExtension(input.extension);

  return `cases/${input.caseId}/requirements/${input.requirementId}/${input.documentFileId}.${extension}`;
}
