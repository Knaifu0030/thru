import { readFile } from "node:fs/promises";
import path from "node:path";
import { validateOutputs } from "./skill-validation.js";
import type { SkillArtifact } from "./types.js";
import { WebcmdSession } from "./webcmd-runner.js";

const candidates: Array<{ id: string; inputs: Record<string, unknown>; alternate: string }> = [
  { id: "example-reference", inputs: {}, alternate: "quotes-by-tag (rejected during reconnaissance: expectation instability)" },
  { id: "httpbin-document", inputs: {}, alternate: "books-catalogue (rejected during reconnaissance: extraction instability)" },
  { id: "cern-history", inputs: {}, alternate: "world-time (rejected during reconnaissance: connection resets)" },
];

const report: { qualified_at: string; webcmd_sessions: string; skills: unknown[] } = { qualified_at: new Date().toISOString(), webcmd_sessions: "10 warm runs in one session plus 3 independent fresh sessions", skills: [] };
for (const candidate of candidates) {
  const skill = JSON.parse(await readFile(path.resolve("skills", `${candidate.id}.skill.json`), "utf8")) as SkillArtifact; const timings: number[] = []; const failures: unknown[] = [];
  const execute = async (session: WebcmdSession, phase: "warm" | "fresh", run: number) => { const started = performance.now(); const result = await session.run(skill, candidate.inputs); const output = result.status === "success" || result.status === "healed_success" ? validateOutputs(skill, result.data) : { ok: false as const, errors: [`status=${result.status}`] }; timings.push(Math.round(performance.now() - started)); if (!output.ok) failures.push({ phase, run, errors: output.errors, healing: result.healing }); };
  const warm = await WebcmdSession.create(); try { for (let run = 1; run <= 10; run++) await execute(warm, "warm", run); } finally { await warm.close(); }
  for (let run = 1; run <= 3; run++) { const fresh = await WebcmdSession.create(); try { await execute(fresh, "fresh", run); } finally { await fresh.close(); } }
  report.skills.push({ id: candidate.id, passed: 13 - failures.length, total: 13, warm_passed: 10 - failures.filter((failure) => (failure as { phase: string }).phase === "warm").length, fresh_passed: 3 - failures.filter((failure) => (failure as { phase: string }).phase === "fresh").length, avg_ms: Math.round(timings.reduce((sum, value) => sum + value, 0) / timings.length), max_ms: Math.max(...timings), failures, alternate: candidate.alternate });
}
console.log(JSON.stringify(report, null, 2));
if (report.skills.some((entry) => (entry as { passed: number }).passed !== 13)) process.exitCode = 1;
