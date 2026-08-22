import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface WebcmdDiagnostic {
  readonly status: "ready" | "degraded";
  readonly version: string | null;
  readonly doctor: "pending" | "healthy" | "unavailable";
  readonly checkedAt: string;
}

let current: WebcmdDiagnostic = {
  status: "degraded",
  version: null,
  doctor: "pending",
  checkedAt: new Date().toISOString(),
};

async function run(args: readonly string[], timeout: number): Promise<string> {
  const command = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "webcmd";
  const commandArgs = process.platform === "win32" ? ["/d", "/s", "/c", "webcmd", ...args] : [...args];
  const result = await execFileAsync(command, commandArgs, {
    timeout,
    windowsHide: true,
    maxBuffer: 256 * 1024,
  });
  return result.stdout.trim();
}

export function getWebcmdDiagnostic(): WebcmdDiagnostic {
  return current;
}

export async function refreshWebcmdDiagnostic(): Promise<WebcmdDiagnostic> {
  const checkedAt = new Date().toISOString();
  try {
    const version = await run(["--version"], 5_000);
    current = { status: "ready", version, doctor: "pending", checkedAt };

    try {
      const raw = await run(["doctor", "-f", "json"], 15_000);
      const report = JSON.parse(raw) as { ok?: boolean };
      current = {
        status: report.ok === false ? "degraded" : "ready",
        version,
        doctor: report.ok === false ? "unavailable" : "healthy",
        checkedAt,
      };
    } catch {
      current = {
        status: "degraded",
        version,
        doctor: "unavailable",
        checkedAt,
      };
    }
  } catch {
    current = {
      status: "degraded",
      version: null,
      doctor: "unavailable",
      checkedAt,
    };
  }
  return current;
}
