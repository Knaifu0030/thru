import path from "node:path";

export interface AppConfig {
  readonly port: number;
  readonly allowedOrigins: ReadonlySet<string>;
  readonly version: string;
  readonly skillsDirectory: string;
  readonly adminKey: string | null;
}

const DEFAULT_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

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
      throw new Error(`Invalid origin in FORGE_ALLOWED_ORIGINS: ${value}`);
    }
  }

  return new Set(values);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: parsePort(env.PORT),
    allowedOrigins: parseOrigins(env.FORGE_ALLOWED_ORIGINS),
    version: env.npm_package_version ?? "0.1.0",
    skillsDirectory: path.resolve(env.FORGE_SKILLS_DIR ?? "skills"),
    adminKey: env.FORGE_ADMIN_KEY?.trim() || null,
  };
}
