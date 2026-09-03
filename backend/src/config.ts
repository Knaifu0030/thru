import path from "node:path";

export interface AppConfig {
  readonly port: number;
  readonly allowedOrigins: ReadonlySet<string>;
  readonly version: string;
  readonly skillsDirectory: string;
  readonly adminKey: string | null;
  readonly runsFile: string;
  readonly keysFile: string;
  readonly teachingFile: string;
  readonly sessionsFile: string;
  readonly approvalsFile: string;
  readonly runRetentionDays: number;
  readonly databaseUrl: string | null;
  readonly rateLimitPerMinute: number;
  readonly queueMaxDepth: number;
}

const DEFAULT_ORIGINS: string[] = [];

function parsePort(raw: string | undefined): number {
  if (raw === undefined) return 8080;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  return port;
}

function parseOrigins(raw: string | undefined): ReadonlySet<string> {
  const values = (raw ?? DEFAULT_ORIGINS.join(","))
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);

  for (const value of values) {
    const url = new URL(value);
    if (url.origin !== value || !["http:", "https:"].includes(url.protocol)) {
      throw new Error(`Invalid origin in THRU_ALLOWED_ORIGINS: ${value}`);
    }
  }

  return new Set(values);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const adminKey = env.THRU_ADMIN_KEY?.trim() || null;
  if (env.NODE_ENV === "production" && !adminKey) throw new Error("THRU_ADMIN_KEY is required in production.");
  return {
    port: parsePort(env.PORT),
    allowedOrigins: parseOrigins(env.THRU_ALLOWED_ORIGINS),
    version: env.npm_package_version ?? "0.1.0",
    skillsDirectory: path.resolve(env.THRU_SKILLS_DIR ?? "skills"),
    adminKey,
    runsFile: path.resolve(env.THRU_RUNS_FILE ?? "data/runs.json"),
    keysFile: path.resolve(env.THRU_KEYS_FILE ?? "data/keys.json"),
    teachingFile: path.resolve(env.THRU_TEACHING_FILE ?? "data/teaching-sessions.json"),
    sessionsFile: path.resolve(env.THRU_SESSIONS_FILE ?? "data/sessions.json"),
    approvalsFile: path.resolve(env.THRU_APPROVALS_FILE ?? "data/approvals.json"),
    runRetentionDays: Math.max(1, Number(env.THRU_RUN_RETENTION_DAYS ?? "30") || 30),
    databaseUrl: env.THRU_DATABASE_URL?.trim() || null,
    rateLimitPerMinute: Math.max(10, Math.min(10_000, Number(env.THRU_RATE_LIMIT_PER_MINUTE ?? "120") || 120)),
    queueMaxDepth: Math.max(1, Math.min(10_000, Number(env.THRU_QUEUE_MAX_DEPTH ?? "100") || 100)),
  };
}
