import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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
  const cli = path.resolve("node_modules/@agentrhq/webcmd/dist/src/main.js");
  const result = await execFileAsync(process.execPath, [cli, ...args], {
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
      let report: { ok?: boolean } | null = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          report = JSON.parse(await run(["doctor", "-f", "json"], 45_000)) as { ok?: boolean };
          break;
        } catch (error) {
          if (attempt === 1) throw error;
          await delay(5_000);
        }
      }
      if (!report) throw new Error("Webcmd doctor returned no report.");
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
