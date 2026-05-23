const sensitiveKeyPatterns = [
  /^token$/i,
  /^tokenHash$/i,
  /^plain.*token$/i,
  /^access.*token$/i,
  /signed.*url/i,
  /^url$/i,
  /storage.*path/i,
  /storage.*bucket/i,
  /passport/i,
  /residence.*card/i,
  /password/i,
  /secret/i,
];

const sensitiveValuePatterns = [
  /https?:\/\//i,
  /supabase\.co\/storage/i,
  /x-amz-signature/i,
  /token=/i,
  /tokenHash=/i,
  /signedUrl=/i,
];

function assertSafeValue(value: unknown, path: string): void {
  if (value === null || value === undefined) {
    return;
  }

  if (typeof value === "string") {
    if (sensitiveValuePatterns.some((pattern) => pattern.test(value))) {
      throw new Error(`Unsafe timeline metadata value at ${path}.`);
    }

    return;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafeValue(item, `${path}[${index}]`));
    return;
  }

  if (typeof value === "object") {
    for (const [key, nestedValue] of Object.entries(value)) {
      if (sensitiveKeyPatterns.some((pattern) => pattern.test(key))) {
        throw new Error(`Unsafe timeline metadata key at ${path}.${key}.`);
      }

      assertSafeValue(nestedValue, `${path}.${key}`);
    }
  }
}

export function assertSafeTimelineMetadata(metadata: unknown): void {
  assertSafeValue(metadata, "metadata");
}
