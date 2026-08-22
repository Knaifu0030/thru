import { spawn } from "node:child_process";
import path from "node:path";
import type { HealingEvent, SkillArtifact } from "./types.js";

interface BrowserResult {
  readonly ok: boolean;
  readonly data?: unknown;
  readonly healing?: Array<{ step: string; selector: string; previous: string; rung: "relocate" | "reforge"; note: string }>;
  readonly needsHuman?: string;
  readonly error?: string;
  readonly narration?: string[];
}

export interface WebcmdRunResult {
  readonly status: "success" | "healed_success" | "portal_error" | "needs_human";
  readonly data: unknown;
  readonly healing: HealingEvent[];
  readonly needsHuman: string | null;
  readonly narration: string[];
  readonly patches: Array<{ step: string; selector: string; previous: string; rung: "relocate" | "reforge"; note: string }>;
}

export async function runWithWebcmd(skill: SkillArtifact, inputs: Record<string, unknown>): Promise<WebcmdRunResult> {
  let sessionId: string | null = null;
  try {
    const created = JSON.parse(await command(["--profile", "default", "session", "create", "-f", "json"])) as { id: string };
    sessionId = created.id;
    const program = buildProgram(skill, inputs);
    const raw = await command(["--profile", "default", "--session", sessionId, "browser", "run", "--stdin", "--no-snapshot-diff", "--timeout", "90", "--max-output", "20000"], program, 95_000);
    const response = JSON.parse(raw) as { ok: boolean; result?: BrowserResult; error?: { message?: string } };
    const result = response.result;
    if (!response.ok || !result) return failure(response.error?.message ?? "Webcmd returned no result.");
    const healing = (result.healing ?? []).map((item) => ({ step: item.step, rung: item.rung, note: item.note } satisfies HealingEvent));
    return {
      status: result.needsHuman ? "needs_human" : result.ok ? (healing.length ? "healed_success" : "success") : "portal_error",
      data: result.data ?? null,
      healing,
      needsHuman: result.needsHuman ?? null,
      narration: result.narration ?? [],
      patches: result.healing ?? [],
    };
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Webcmd execution failed.");
  } finally {
    if (sessionId) await command(["--profile", "default", "session", "close", sessionId, "-f", "json"], undefined, 10_000).catch(() => undefined);
  }
}

function failure(message: string): WebcmdRunResult {
  return { status: "portal_error", data: null, healing: [{ step: "browser", rung: "retry", note: message.slice(0, 160) }], needsHuman: null, narration: ["The browser workflow stopped safely."], patches: [] };
}

function command(args: string[], stdin?: string, timeout = 15_000): Promise<string> {
  const cli = path.resolve("node_modules/@agentrhq/webcmd/dist/src/main.js");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const timer = setTimeout(() => child.kill(), timeout);
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      const output = Buffer.concat(stdout).toString("utf8").trim();
      if (code === 0) resolve(output);
      else reject(new Error(Buffer.concat(stderr).toString("utf8").trim() || output || `webcmd exited ${code}`));
    });
    child.stdin.end(stdin);
  });
}

function buildProgram(skill: SkillArtifact, inputs: Record<string, unknown>): string {
  const site = /^https?:\/\//.test(skill.skill.site.domain) ? skill.skill.site.domain : `https://${skill.skill.site.domain}`;
  return `
const skill = ${JSON.stringify(skill)};
const inputs = ${JSON.stringify(inputs)};
const site = ${JSON.stringify(site)};
const healing = [];
const narration = [];
let data = null;
const resolveValue = (path) => path.split('.').reduce((value, key) => value == null ? value : value[key], {inputs});
const exists = async (selector) => { try { return await page.locator(selector).count() > 0; } catch { return false; } };
const choose = async (step) => {
  const selectors = [step.selector_primary, ...(step.selector_fallbacks || [])].filter(Boolean);
  for (const selector of selectors) if (await exists(selector)) return {selector, rung: selector === step.selector_primary ? null : 'relocate'};
  if (step.action === 'click') {
    const labels = await page.getByRole('button').allTextContents();
    const words = step.target_description.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    let best = null;
    for (const label of labels) {
      const candidate = label.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      const overlap = words.filter(word => candidate.includes(word)).length / Math.max(words.length, candidate.length, 1);
      if (!best || overlap > best.score) best = {label, score: overlap};
    }
    if (best && best.score >= 0.4) return {selector: 'text:' + best.label, rung: 'reforge'};
  }
  return null;
};
const locator = (selector) => selector.startsWith('text:') ? page.getByText(selector.slice(5), {exact:true}) : page.locator(selector);
const verify = async (expect) => {
  const body = await page.locator('body').innerText();
  if (expect.contains && !expect.contains.every(text => body.includes(text))) return false;
  if (expect.not_contains && expect.not_contains.some(text => body.toLowerCase().includes(text.toLowerCase()))) return false;
  if (expect.url_contains && !page.url().includes(expect.url_contains)) return false;
  if (expect.element_present && !(await locator(expect.element_present).isVisible())) return false;
  if (expect.field_value_equals) {
    const expected = String(resolveValue(expect.field_value_equals));
    const focused = page.locator(':focus');
    if (await focused.inputValue() !== expected) return false;
  }
  return true;
};
for (const step of skill.workflow.steps) {
  narration.push(('Running ' + step.target_description + '…').slice(0, 79));
  if (step.action !== 'navigate') {
    const body = (await page.locator('body').innerText()).toLowerCase();
    const password = await page.locator('input[type="password"]').count() > 0;
    if (password || /\\b(captcha|one.time password|otp|payment details)\\b/.test(body)) return {ok:false, needsHuman:'The site requires a sensitive human step.', healing, narration};
  }
  if (step.action === 'navigate') {
    const url = String(step.url || site).replace('{site}', site);
    let opened = false;
    for (const delay of [0, 2000, 5000]) {
      if (delay) await page.waitForTimeout(delay);
      try { await page.goto(url, {waitUntil:'domcontentloaded', timeout:step.timeout_ms}); opened = true; break; } catch {}
    }
    if (!opened) return {ok:false, error:'Navigation failed after three attempts.', healing, narration};
  } else {
    const selected = await choose(step);
    if (!selected) return {ok:false, error:'Target is missing: ' + step.target_description, healing, narration};
    if (selected.rung) healing.push({step:step.id, selector:selected.selector, previous:step.selector_primary, rung:selected.rung, note:'Found ' + selected.selector + ' by meaning.'});
    const target = locator(selected.selector);
    if (step.action === 'fill') await target.fill(String(resolveValue(step.value_from)));
    if (step.action === 'click') await target.click();
    if (step.action === 'extract') {
      const selector = step.extraction && step.extraction.selector || selected.selector;
      const text = await locator(selector).innerText();
      if (step.extraction && step.extraction.strategy === 'json_element') data = JSON.parse(text);
      else data = {text};
    }
  }
  if (!(await verify(step.expect))) return {ok:false, error:'Expectation failed after ' + step.id, healing, narration};
}
return {ok:true, data, healing, narration};`;
}
