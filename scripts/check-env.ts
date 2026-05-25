import { existsSync } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const envFiles = [".env", ".env.local"];

for (const envFile of envFiles) {
  const envPath = path.resolve(process.cwd(), envFile);
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath, override: true, quiet: true });
  }
}

type EnvCheck = {
  name: string;
  required: boolean;
  note?: string;
  summarize?: (value: string) => string;
};

type EnvGroup = {
  title: string;
  checks: EnvCheck[];
};

function summarizeUrl(value: string): string {
  try {
    const parsed = new URL(value);
    return `host=${parsed.host}`;
  } catch {
    return "present, invalid URL format";
  }
}

function summarizeList(value: string): string {
  const count = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean).length;

  return `${count} item${count === 1 ? "" : "s"}`;
}

function summarizePlain(value: string): string {
  return value;
}

function isPresent(name: string): boolean {
  const value = process.env[name];
  return value !== undefined && value.trim().length > 0;
}

const backend = process.env.RATE_LIMIT_BACKEND?.trim() || "memory";
const upstashRequired = backend === "upstash";

const groups: EnvGroup[] = [
  {
    title: "Database",
    checks: [
      { name: "DATABASE_URL", required: true, summarize: summarizeUrl },
      { name: "DIRECT_URL", required: true, summarize: summarizeUrl },
    ],
  },
  {
    title: "Admin auth",
    checks: [
      { name: "NEXTAUTH_SECRET", required: true },
      { name: "NEXTAUTH_URL", required: true, summarize: summarizeUrl },
      { name: "GOOGLE_CLIENT_ID", required: true },
      { name: "GOOGLE_CLIENT_SECRET", required: true },
      {
        name: "ADMIN_EMAIL_ALLOWLIST",
        required: true,
        summarize: summarizeList,
      },
    ],
  },
  {
    title: "Portal token",
    checks: [{ name: "TOKEN_HASH_SECRET", required: true }],
  },
  {
    title: "Supabase Storage",
    checks: [
      { name: "SUPABASE_URL", required: true, summarize: summarizeUrl },
      { name: "SUPABASE_SERVICE_ROLE_KEY", required: true },
      { name: "SUPABASE_STORAGE_BUCKET", required: true },
      {
        name: "STORAGE_SIGNED_URL_EXPIRES_IN_SECONDS",
        required: false,
        summarize: summarizePlain,
      },
    ],
  },
  {
    title: "Upload policy",
    checks: [
      {
        name: "MAX_UPLOAD_FILE_SIZE_MB",
        required: true,
        summarize: summarizePlain,
      },
      {
        name: "ALLOWED_UPLOAD_MIME_TYPES",
        required: true,
        summarize: summarizeList,
      },
    ],
  },
  {
    title: "Rate limit",
    checks: [
      {
        name: "RATE_LIMIT_BACKEND",
        required: true,
        summarize: summarizePlain,
      },
      {
        name: "UPSTASH_REDIS_REST_URL",
        required: upstashRequired,
        summarize: summarizeUrl,
        note: "required when RATE_LIMIT_BACKEND=upstash",
      },
      {
        name: "UPSTASH_REDIS_REST_TOKEN",
        required: upstashRequired,
        note: "required when RATE_LIMIT_BACKEND=upstash",
      },
    ],
  },
];

const missingRequired: string[] = [];

console.log("Environment readiness check");
console.log("Values are intentionally redacted.");

for (const group of groups) {
  console.log(`\n[${group.title}]`);

  for (const check of group.checks) {
    const value = process.env[check.name];
    const present = isPresent(check.name);
    const status = present ? "OK" : check.required ? "MISSING" : "optional";
    const summary =
      present && value && check.summarize ? ` (${check.summarize(value)})` : "";
    const note = check.note ? ` - ${check.note}` : "";

    if (!present && check.required) {
      missingRequired.push(check.name);
    }

    console.log(`- ${check.name}: ${status}${summary}${note}`);
  }
}

if (backend !== "memory" && backend !== "upstash") {
  missingRequired.push("RATE_LIMIT_BACKEND(valid value: memory|upstash)");
}

if (process.env.NODE_ENV === "production" && backend === "memory") {
  missingRequired.push("RATE_LIMIT_BACKEND(upstash required in production)");
}

if (missingRequired.length > 0) {
  console.log("\nMissing or invalid required environment variables:");
  for (const name of missingRequired) {
    console.log(`- ${name}`);
  }
  process.exitCode = 1;
} else {
  console.log("\nEnvironment looks ready for runtime smoke checks.");
}
