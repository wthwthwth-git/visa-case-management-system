export class MissingEnvironmentVariableError extends Error {
  constructor(name: string) {
    super(`Missing required environment variable: ${name}`);
    this.name = "MissingEnvironmentVariableError";
  }
}

export function getOptionalEnv(name: string): string | undefined {
  const value = process.env[name];

  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  return value;
}

export function getRequiredEnv(name: string): string {
  const value = getOptionalEnv(name);

  if (value === undefined) {
    throw new MissingEnvironmentVariableError(name);
  }

  return value;
}

export function getRequiredNumberEnv(name: string): number {
  const value = getRequiredEnv(name);
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new MissingEnvironmentVariableError(name);
  }

  return parsed;
}
