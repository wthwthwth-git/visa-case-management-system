export function normalizeAdminEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function parseAdminEmailAllowlist(value: string | undefined): Set<string> {
  if (!value) {
    return new Set();
  }

  return new Set(
    value
      .split(",")
      .map((entry) => normalizeAdminEmail(entry))
      .filter((entry) => entry.length > 0),
  );
}

export function isAdminEmailAllowed(email: string, allowlist = process.env.ADMIN_EMAIL_ALLOWLIST): boolean {
  const allowedEmails = parseAdminEmailAllowlist(allowlist);

  if (allowedEmails.size === 0) {
    return false;
  }

  return allowedEmails.has(normalizeAdminEmail(email));
}
