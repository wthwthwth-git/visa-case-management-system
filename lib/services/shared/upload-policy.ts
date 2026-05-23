export type UploadFileInput = {
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  body: ArrayBuffer | Uint8Array;
};

export type ValidatedUploadFile = UploadFileInput & {
  safeExtension: string;
};

export class UploadPolicyError extends Error {
  constructor(message = "File does not meet upload policy.") {
    super(message);
    this.name = "UploadPolicyError";
  }
}

const defaultAllowedMimeTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "text/plain",
  "text/csv",
  "application/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/rtf",
  "text/rtf",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation",
  "application/zip",
  "application/x-zip-compressed",
];
const defaultMaxFileSizeMb = 20;
const maxFileNameLength = 255;

const extensionByMimeType: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/csv": "csv",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/rtf": "rtf",
  "text/rtf": "rtf",
  "application/vnd.oasis.opendocument.text": "odt",
  "application/vnd.oasis.opendocument.spreadsheet": "ods",
  "application/vnd.oasis.opendocument.presentation": "odp",
  "application/zip": "zip",
  "application/x-zip-compressed": "zip",
};

const labelByMimeType: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/gif": "GIF",
  "image/webp": "WEBP",
  "image/heic": "HEIC",
  "image/heif": "HEIF",
  "text/plain": "TXT",
  "text/csv": "CSV",
  "application/csv": "CSV",
  "application/msword": "Word (.doc)",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word (.docx)",
  "application/vnd.ms-excel": "Excel (.xls)",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel (.xlsx)",
  "application/vnd.ms-powerpoint": "PowerPoint (.ppt)",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PowerPoint (.pptx)",
  "application/rtf": "RTF",
  "text/rtf": "RTF",
  "application/vnd.oasis.opendocument.text": "ODT",
  "application/vnd.oasis.opendocument.spreadsheet": "ODS",
  "application/vnd.oasis.opendocument.presentation": "ODP",
  "application/zip": "ZIP",
  "application/x-zip-compressed": "ZIP",
};

function getAllowedMimeTypes() {
  const rawValue = process.env.ALLOWED_UPLOAD_MIME_TYPES;

  if (!rawValue) {
    return defaultAllowedMimeTypes;
  }

  const values = rawValue
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return values.length > 0 ? values : defaultAllowedMimeTypes;
}

export function getAllowedUploadFileTypeDescription() {
  const labels = getAllowedMimeTypes().map((mimeType) => labelByMimeType[mimeType] ?? mimeType);
  return Array.from(new Set(labels)).join("、");
}

function getMaxFileSizeMb() {
  const rawValue = process.env.MAX_UPLOAD_FILE_SIZE_MB;
  const parsed = rawValue ? Number.parseInt(rawValue, 10) : defaultMaxFileSizeMb;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultMaxFileSizeMb;
}

function getMaxFileSizeBytes() {
  return getMaxFileSizeMb() * 1024 * 1024;
}

function assertSafeOriginalFileName(originalFileName: string) {
  const trimmed = originalFileName.trim();

  if (!trimmed) {
    throw new UploadPolicyError("文件名不能为空。");
  }

  if (trimmed.length > maxFileNameLength) {
    throw new UploadPolicyError("文件名过长。");
  }

  const hasControlCharacter = Array.from(trimmed).some(
    (character) => character.charCodeAt(0) < 32,
  );

  if (/[\\/:*?"<>|]/u.test(trimmed) || hasControlCharacter) {
    throw new UploadPolicyError("文件名包含不能使用的字符。");
  }
}

export function validateUploadFile(file: UploadFileInput): ValidatedUploadFile {
  assertSafeOriginalFileName(file.originalFileName);

  const mimeType = file.mimeType.trim().toLowerCase();
  const allowedMimeTypes = getAllowedMimeTypes();

  if (!allowedMimeTypes.includes(mimeType)) {
    throw new UploadPolicyError(
      `文件格式不符合要求。允许上传：${getAllowedUploadFileTypeDescription()}。`,
    );
  }

  if (!Number.isFinite(file.fileSize) || file.fileSize <= 0) {
    throw new UploadPolicyError("文件大小无效。");
  }

  if (file.fileSize > getMaxFileSizeBytes()) {
    throw new UploadPolicyError(`文件大小超过限制。单个文件最大 ${getMaxFileSizeMb()}MB。`);
  }

  return {
    ...file,
    mimeType,
    originalFileName: file.originalFileName.trim(),
    safeExtension: extensionByMimeType[mimeType] ?? "bin",
  };
}
