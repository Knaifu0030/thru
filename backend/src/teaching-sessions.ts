import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { JsonSchema, SkillArtifact, WorkflowStep } from "./types.js";
import type { THRUEngine } from "./forge-engine.js";
import type { SkillExecutor } from "./executor.js";
import { WebcmdSession } from "./webcmd-runner.js";
import { validateArtifact } from "./skill-validation.js";
import type { DatabaseRuntime } from "./database.js";
import { SYSTEM_USER_ID } from "./database.js";

export type TeachingState = "draft" | "review" | "validated" | "published" | "expired";
export interface TeachingEvidence { url?: string; title?: string; selector?: string; text?: string; screenshot_ref?: string; }
export interface TeachingAction { type: "navigate" | "fill" | "click" | "extract" | "wait" | "switch_tab" | "switch_frame"; target?: string; value?: string; evidence?: TeachingEvidence; at: string; source?: "system" | "user" }
export interface TeachingEvent { type: "created" | "capture_started" | "capture_stopped" | "capture_error" | "action" | "validated" | "published"; at: string; message: string }
export interface TeachingCaptureState { status: "idle" | "running" | "stopped" | "error"; started_at: string | null; last_action_at: string | null; current_url: string | null; title: string | null; last_screenshot_ref: string | null; error: string | null }
export interface TeachingSession { id: string; user_id?: string | null; goal_text: string; url: string; sample_inputs: Record<string, unknown>; state: TeachingState; created_at: string; expires_at: string; actions: TeachingAction[]; events: TeachingEvent[]; artifact: SkillArtifact | null; validation_error: string | null; replay: { status: string; at: string } | null; capture?: TeachingCaptureState }
interface CaptureObservation { url?: string; title?: string; selector?: string; text?: string; screenshot_base64?: unknown; screenshot_ref?: string }

export class TeachingSessionStore {
  #sessions = new Map<string, TeachingSession>();
  #captures = new Map<string, WebcmdSession>();
  #persistence: Promise<void> = Promise.resolve();
  constructor(private readonly engine: THRUEngine, private readonly ttlMs = 15 * 60_000, private readonly storagePath: string | null = null, private readonly executor?: SkillExecutor, private readonly database?: DatabaseRuntime) {}
  async ready(): Promise<void> {
    if (this.storagePath) { await mkdir(path.dirname(this.storagePath), { recursive: true }); await this.#loadFile(); }
    if (this.database?.pool) {
      const rows = await this.database.pool.query<{ id: string; user_id: string; goal_text: string; start_url: string; state: TeachingState; actions: TeachingAction[]; events: TeachingEvent[]; artifact: SkillArtifact | null; sample_inputs: Record<string, unknown>; validation_error: string | null; replay: { status: string; at: string } | null; expires_at: Date; created_at: Date }>("select id, user_id, goal_text, start_url, state, actions, events, artifact, sample_inputs, validation_error, replay, expires_at, created_at from teaching_sessions");
      for (const row of rows.rows) this.#sessions.set(row.id, { id: row.id, user_id: row.user_id, goal_text: row.goal_text, url: row.start_url, state: row.state, actions: row.actions ?? [], events: row.events ?? [], artifact: row.artifact, sample_inputs: row.sample_inputs ?? {}, validation_error: row.validation_error, replay: row.replay, expires_at: row.expires_at.toISOString(), created_at: row.created_at.toISOString(), capture: idleCapture() });
    }
    this.#expire();
    if (this.#sessions.size) await this.#persist();
  }
  async create(goal_text: string, url: string, sample_inputs?: Record<string, unknown>, userId = SYSTEM_USER_ID): Promise<TeachingSession> { const proposal = await this.engine.propose({ goal_text, url, ...(sample_inputs ? { sample_inputs } : {}) }); const now = Date.now(); const createdAt = new Date(now).toISOString(); const session: TeachingSession = { id: randomUUID(), user_id: userId, goal_text, url, sample_inputs: sample_inputs ?? {}, state: "review", created_at: createdAt, expires_at: new Date(now + this.ttlMs).toISOString(), actions: [{ type: "navigate", target: url, at: createdAt, source: "system" }], events: [{ type: "created", at: createdAt, message: "Teaching session created." }], artifact: proposal.artifact, validation_error: null, replay: null, capture: idleCapture() }; this.#sessions.set(session.id, session); await this.#persist(); return session; }
  get(id: string, userId?: string | null): TeachingSession | undefined { this.#expire(); const session = this.#sessions.get(id); return session && (userId === undefined || (session.user_id ?? SYSTEM_USER_ID) === userId) ? session : undefined; }
  list(userId?: string | null): TeachingSession[] { this.#expire(); return [...this.#sessions.values()].filter((session) => userId === undefined || (session.user_id ?? SYSTEM_USER_ID) === userId); }
  async startCapture(id: string, userId?: string | null): Promise<TeachingSession> {
    const session = this.require(id);
    if (userId !== undefined && (session.user_id ?? SYSTEM_USER_ID) !== userId) throw new Error("Teaching session not found or owned by another user.");
    if (session.state === "published") throw new Error("Published sessions cannot capture more actions.");
    if (this.#captures.has(id)) return session;
    assertSafeNavigation(session.url);
    const browser = await WebcmdSession.create(`thru-teaching-${id}`);
    this.#captures.set(id, browser);
    const started = new Date().toISOString();
    session.capture = { status: "running", started_at: started, last_action_at: null, current_url: session.url, title: null, last_screenshot_ref: null, error: null };
    session.events.push({ type: "capture_started", at: started, message: "Isolated guided browser capture started." });
    try {
      const evidence = await this.#runCaptureBrowser(id, { type: "navigate", target: session.url });
      session.capture = { ...session.capture, current_url: evidence.url ?? session.url, title: evidence.title ?? null, last_screenshot_ref: evidence.screenshot_ref ?? null };
      await this.#persist();
      return session;
    } catch (error) {
      session.capture = { ...session.capture, status: "error", error: safeError(error) };
      session.events.push({ type: "capture_error", at: new Date().toISOString(), message: safeError(error) });
      await this.#persist();
      await browser.close().catch(() => undefined); this.#captures.delete(id);
      throw error;
    }
  }
  async captureAction(id: string, action: Omit<TeachingAction, "at" | "source" | "evidence"> & { runtime_value?: string }, userId?: string | null): Promise<TeachingSession> {
    const session = this.require(id);
    if (userId !== undefined && (session.user_id ?? SYSTEM_USER_ID) !== userId) throw new Error("Teaching session not found or owned by another user.");
    if (!this.#captures.has(id)) await this.startCapture(id, userId);
    const evidence = await this.#runCaptureBrowser(id, action);
    const storedValue = action.type === "fill" ? (action.value?.trim() || normalizeInputKey(action.target ?? "input")) : action.value;
    const recordedEvidence: TeachingEvidence = { ...(evidence.url ? { url: evidence.url } : {}), ...(evidence.title ? { title: evidence.title } : {}), ...(evidence.selector ? { selector: evidence.selector } : {}), ...(evidence.text ? { text: evidence.text } : {}), ...(evidence.screenshot_ref ? { screenshot_ref: evidence.screenshot_ref } : {}) };
    await this.addAction(id, { type: action.type, ...(action.target ? { target: action.target } : {}), ...(storedValue ? { value: storedValue } : {}), ...(Object.keys(recordedEvidence).length ? { evidence: recordedEvidence } : {}) });
    session.capture = { ...(session.capture ?? idleCapture()), status: "running", last_action_at: new Date().toISOString(), current_url: evidence.url ?? session.capture?.current_url ?? null, title: evidence.title ?? session.capture?.title ?? null, last_screenshot_ref: evidence.screenshot_ref ?? session.capture?.last_screenshot_ref ?? null, error: null };
    await this.#persist();
    return session;
  }
  async stopCapture(id: string, userId?: string | null): Promise<TeachingSession | undefined> {
    const session = this.get(id);
    if (!session || (userId !== undefined && (session.user_id ?? SYSTEM_USER_ID) !== userId)) return undefined;
    const browser = this.#captures.get(id); this.#captures.delete(id);
    if (browser) await browser.close().catch(() => undefined);
    if (session.capture?.status === "running") { session.capture = { ...session.capture, status: "stopped" }; session.events.push({ type: "capture_stopped", at: new Date().toISOString(), message: "Guided browser capture stopped." }); await this.#persist(); }
    return session;
  }
  async #runCaptureBrowser(id: string, action: { type: TeachingAction["type"]; target?: string; value?: string; runtime_value?: string }): Promise<CaptureObservation> {
    const session = this.require(id);
    const browser = this.#captures.get(id);
    if (!browser) throw new Error("Teaching browser capture is not active.");
    if (action.type === "navigate") assertAllowedNavigation(action.target ?? "", session.url);
    const root = path.resolve(path.dirname(this.storagePath ?? path.join("data", "teaching-sessions.json")));
    const directory = path.join(root, "captures", id);
    await mkdir(directory, { recursive: true });
    const filename = `${Date.now()}-${randomUUID()}.jpg`;
    const screenshotPath = path.join(directory, filename);
    const screenshotRef = `captures/${id}/${filename}`;
    const timeout = action.type === "wait" ? 30_000 : 15_000;
    const target = JSON.stringify(action.target ?? "");
    const value = JSON.stringify(action.runtime_value ?? (action.type === "wait" ? action.value ?? "1000" : ""));
    const program = `const actionType=${JSON.stringify(action.type)};const target=${target};const runtimeValue=${value};const resolveTarget=(s)=>s.startsWith('label:')?page.getByLabel(s.slice(6),{exact:false}):s.startsWith('text:')?page.getByText(s.slice(5),{exact:true}):page.locator(s);let selected=target||null;let text='';if(actionType==='navigate'){await page.goto(target,{waitUntil:'domcontentloaded',timeout:${timeout}})}else if(actionType==='wait'){const ms=Math.max(100,Math.min(30000,Number(runtimeValue)||1000));await page.waitForTimeout(ms)}else if(actionType==='switch_tab'){const wanted=target;const found=context.pages().find(candidate=>candidate.url().includes(wanted)||candidate.url()===wanted||(!wanted&&candidate!==page));if(!found)throw new Error('Recorded browser tab was not available.');page=found}else if(actionType==='switch_frame'){const wanted=target;const found=page.frames().find(frame=>frame!==page.mainFrame()&&(frame.url().includes(wanted)||frame.name()===wanted));if(!found)throw new Error('Recorded browser frame was not available.');text=(await found.locator('body').innerText({timeout:2000})).slice(0,5000)}else{if(!target)throw new Error('A CSS, label:, or text: target is required.');const locator=resolveTarget(target);if(await locator.count()===0)throw new Error('Target was not found: '+target);if(actionType==='fill'){if(!runtimeValue)throw new Error('capture_value is required for fill actions.');await locator.first().fill(runtimeValue)}else if(actionType==='click'){await locator.first().click({timeout:${timeout}})}else if(actionType==='extract'){text=(await locator.first().innerText({timeout:${timeout}})).slice(0,5000)}else{throw new Error('Unsupported capture action.')}}const screenshot_base64=await page.screenshot({type:'jpeg',quality:50,encoding:'base64'});const body=(text||await page.locator('body').innerText({timeout:2000})).slice(0,5000);return{url:page.url(),title:await page.title(),selector:selected,text:body,screenshot_base64};`;
    const result = await browser.runRaw<CaptureObservation>(program, timeout + 5_000, 200_000);
    if (typeof result.screenshot_base64 === "string") await writeFile(screenshotPath, Buffer.from(result.screenshot_base64, "base64"));
    else if (result.screenshot_base64 && typeof result.screenshot_base64 === "object") {
      const source = result.screenshot_base64 as { data?: unknown };
      const bytes = Array.isArray(source.data) ? source.data : Object.entries(source).filter(([key]) => /^\d+$/.test(key)).sort(([a], [b]) => Number(a) - Number(b)).map(([, value]) => value);
      if (bytes.length && bytes.every((value) => Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 255)) await writeFile(screenshotPath, Buffer.from(bytes as number[]));
    }
    assertAllowedNavigation(result.url ?? session.url, session.url);
    return { ...result, screenshot_ref: screenshotRef };
  }
  async addAction(id: string, action: Omit<TeachingAction, "at" | "source">): Promise<TeachingSession> { const session = this.require(id); if (session.state === "published") throw new Error("Published sessions cannot change."); if (!action.type || !["navigate", "fill", "click", "extract", "wait", "switch_tab", "switch_frame"].includes(action.type)) throw new Error("Unsupported teaching action."); if (action.type !== "wait" && !action.target?.trim()) throw new Error("This teaching action needs a target."); if (action.type === "navigate") assertAllowedNavigation(action.target!, session.url); const at = new Date().toISOString(); const evidence = sanitizeEvidence(action.evidence); session.actions.push({ ...action, ...(evidence ? { evidence } : {}), at, source: "user" }); session.events.push({ type: "action", at, message: `Recorded ${action.type} action${evidence ? " with evidence" : ""}.` }); if (session.artifact) session.artifact = applyRecordedActions(session.artifact, session.url, session.actions); session.state = "review"; session.replay = null; await this.#persist(); return session; }
  async review(id: string, artifact?: unknown): Promise<TeachingSession> { const session = this.require(id); if (artifact !== undefined) session.artifact = artifact as SkillArtifact; session.state = "review"; session.validation_error = null; session.replay = null; await this.#persist(); return session; }
  async validate(id: string, options: { approveSensitive?: boolean } = {}): Promise<TeachingSession> { const session = this.require(id); if (!session.artifact) throw new Error("No artifact to validate."); if (!session.actions.some((action) => action.source === "user")) { session.validation_error = "Record at least one guided action before validation."; await this.#persist(); throw new Error(session.validation_error); } const shape = validateArtifact(session.artifact); if (!shape.ok) { session.validation_error = shape.errors.join("; "); await this.#persist(); throw new Error(session.validation_error); } const required = session.artifact.contract.inputs.required ?? []; if (required.some((key) => !(key in session.sample_inputs))) { session.validation_error = "Provide sample inputs for every required field before replay validation."; await this.#persist(); throw new Error(session.validation_error); } const sensitive = session.artifact.skill.sensitive || session.artifact.workflow.steps.some((step) => step.sensitive); if (sensitive && !options.approveSensitive) { session.validation_error = "Sensitive drafts require an explicit operator approval to replay."; await this.#persist(); throw new Error(session.validation_error); } if (this.executor) { const replay = await this.executor.previewArtifact(session.artifact, session.sample_inputs, sensitive ? { surface: "local_human", timeBudgetMs: 55_000, humanGate: async () => true } : { surface: "rest", timeBudgetMs: 55_000 }); session.replay = { status: replay.status, at: new Date().toISOString() }; if (replay.status !== "success" && replay.status !== "healed_success") { session.validation_error = `Replay failed with ${replay.status}.`; await this.#persist(); throw new Error(session.validation_error); } } session.state = "validated"; session.validation_error = null; session.events.push({ type: "validated", at: new Date().toISOString(), message: "Teaching draft replay validated." }); await this.#persist(); return session; }
  async publish(id: string): Promise<SkillArtifact> { const session = this.require(id); if (session.state !== "validated") throw new Error("Session must validate before publishing."); if (!session.artifact) throw new Error("No artifact to publish."); const saved = await this.engine.importArtifact(session.artifact, session.user_id); session.state = "published"; session.artifact = saved; session.events.push({ type: "published", at: new Date().toISOString(), message: `Published ${saved.skill.name}.` }); await this.#persist(); return saved; }
  async delete(id: string): Promise<boolean> { await this.stopCapture(id); const deleted = this.#sessions.delete(id); if (deleted) await this.#persist(); return deleted; }
  #expire(): void { const now = Date.now(); for (const session of this.#sessions.values()) if (Date.parse(session.expires_at) <= now && session.state !== "published") { session.state = "expired"; const browser = this.#captures.get(session.id); if (browser) { void browser.close().catch(() => undefined); this.#captures.delete(session.id); } if (session.capture?.status === "running") session.capture = { ...session.capture, status: "stopped" }; } }
  private require(id: string): TeachingSession { const session = this.get(id); if (!session || session.state === "expired") throw new Error("Teaching session not found or expired."); return session; }
  async #loadFile(): Promise<void> { try { const parsed = JSON.parse(await readFile(this.storagePath!, "utf8")) as TeachingSession[]; for (const session of parsed) { session.sample_inputs ??= {}; session.events ??= []; session.replay ??= null; session.user_id ??= SYSTEM_USER_ID; this.#sessions.set(session.id, session); } } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } }
  async #persist(): Promise<void> { this.#persistence = this.#persistence.catch(() => undefined).then(async () => { if (this.database?.pool) await this.#persistDatabase(); if (!this.storagePath) return; const temp = `${this.storagePath}.${randomUUID()}.tmp`; await writeFile(temp, `${JSON.stringify([...this.#sessions.values()])}\n`, "utf8"); await rename(temp, this.storagePath); }); return this.#persistence; }
  async #persistDatabase(): Promise<void> { const pool = this.database?.pool; if (!pool) return; const client = await pool.connect(); try { await client.query("begin"); const ids = [...this.#sessions.keys()]; if (ids.length) await client.query("delete from teaching_sessions where not (id = any($1::uuid[]))", [ids]); else await client.query("delete from teaching_sessions"); for (const session of this.#sessions.values()) await client.query("insert into teaching_sessions (id, user_id, goal_text, start_url, state, actions, events, artifact, sample_inputs, validation_error, replay, expires_at, created_at) values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11::jsonb, $12, $13) on conflict (id) do update set user_id = excluded.user_id, state = excluded.state, actions = excluded.actions, events = excluded.events, artifact = excluded.artifact, sample_inputs = excluded.sample_inputs, validation_error = excluded.validation_error, replay = excluded.replay, expires_at = excluded.expires_at", [session.id, session.user_id ?? SYSTEM_USER_ID, session.goal_text, session.url, session.state, JSON.stringify(session.actions), JSON.stringify(session.events), JSON.stringify(session.artifact), JSON.stringify(session.sample_inputs), session.validation_error, JSON.stringify(session.replay), session.expires_at, session.created_at]); await client.query("commit"); } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); } }
}

function idleCapture(): TeachingCaptureState { return { status: "idle", started_at: null, last_action_at: null, current_url: null, title: null, last_screenshot_ref: null, error: null }; }
function safeError(error: unknown): string { return (error instanceof Error ? error.message : "Teaching browser capture failed.").slice(0, 500); }

/** Turn explicitly recorded user actions into the draft workflow. The first
 * system navigation is retained, while user actions replace the inferred
 * interaction steps so the replay tests exactly what the operator described. */
function applyRecordedActions(base: SkillArtifact, startUrl: string, actions: TeachingAction[]): SkillArtifact {
  const systemNavigation = actions.find((action) => action.source === "system" && action.type === "navigate");
  const userActions = actions.filter((action) => action.source === "user");
  if (!userActions.length) return base;
  const steps: WorkflowStep[] = [{
    id: "s1",
    action: "navigate",
    target_description: "Open the teaching start page",
    url: systemNavigation?.target ?? startUrl,
    expect: { element_present: "body", not_contains: ["captcha", "access denied"] },
    timeout_ms: 15_000,
    sensitive: false,
  }];
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];
  let sensitive = false;
  for (const [index, action] of userActions.entries()) {
    const id = `s${steps.length + 1}`;
    const target = action.target?.trim() ?? "";
    const flagged = /submit|send|delete|pay|purchase|transfer|login|otp|captcha|password/i.test(`${target} ${action.value ?? ""}`);
    sensitive ||= flagged;
    if (action.type === "navigate") {
      steps.push({ id, action: "navigate", target_description: target, url: target, expect: { element_present: "body", not_contains: ["captcha", "access denied"] }, timeout_ms: 15_000, sensitive: flagged });
    } else if (action.type === "fill") {
      const key = normalizeInputKey(action.value || target || `input-${index + 1}`);
      properties[key] = { type: "string", description: `Value for ${target || key}` };
      if (!required.includes(key)) required.push(key);
      steps.push({ id, action: "fill", target_description: target || key, selector_primary: target, selector_fallbacks: [], value_from: `inputs.${key}`, expect: { field_value_equals: `inputs.${key}`, not_contains: ["captcha", "password"] }, timeout_ms: 8_000, sensitive: flagged });
    } else if (action.type === "click") {
      steps.push({ id, action: "click", target_description: target, selector_primary: target, selector_fallbacks: [], expect: { element_present: "body", not_contains: ["access denied"] }, timeout_ms: 10_000, sensitive: flagged });
    } else if (action.type === "extract") {
      steps.push({ id, action: "extract", target_description: target || "Read the resulting page", selector_primary: target || "main", selector_fallbacks: ["article", "body"], extraction: { strategy: "header_map", map_to: "outputs", selector: target || "main" }, expect: { element_present: "body", not_contains: ["access denied"] }, timeout_ms: 10_000, sensitive: flagged });
    } else if (action.type === "wait") {
      const waitMs = Math.max(100, Math.min(30_000, Number(action.value) || 1_000));
      steps.push({ id, action: "wait", target_description: target || `Wait ${waitMs}ms for the page to settle`, wait_ms: waitMs, expect: { element_present: "body", not_contains: ["access denied"] }, timeout_ms: Math.max(2_000, waitMs + 2_000), sensitive: false });
    } else if (action.type === "switch_tab") {
      steps.push({ id, action: "switch_tab", target_description: target || "Switch to the recorded browser tab", ...(target ? { selector_primary: target } : {}), expect: { element_present: "body", not_contains: ["access denied"] }, timeout_ms: 10_000, sensitive: flagged });
    } else if (action.type === "switch_frame") {
      steps.push({ id, action: "switch_frame", target_description: target || "Switch to the recorded frame", selector_primary: target || "iframe", expect: { element_present: "body", not_contains: ["access denied"] }, timeout_ms: 10_000, sensitive: flagged });
    }
  }
  // Every published workflow needs a deterministic output boundary. If the
  // operator recorded navigation/interactions but no explicit extraction,
  // retain the read-only page extraction inferred by the proposal.
  if (!userActions.some((action) => action.type === "extract")) {
    steps.push({ id: `s${steps.length + 1}`, action: "extract", target_description: "Read the resulting page", selector_primary: "main", selector_fallbacks: ["article", "body"], extraction: { strategy: "header_map", map_to: "outputs", selector: "main" }, expect: { element_present: "body", not_contains: ["access denied"] }, timeout_ms: 10_000, sensitive: false });
  }
  const inputSchema: JsonSchema = { type: "object", properties, required, additionalProperties: false };
  return { ...base, contract: { ...base.contract, inputs: Object.keys(properties).length ? inputSchema : base.contract.inputs }, workflow: { ...base.workflow, steps }, skill: { ...base.skill, sensitive: base.skill.sensitive || sensitive } };
}

function normalizeInputKey(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return normalized || "input";
}

function assertSafeNavigation(raw: string): void {
  const parsed = new URL(raw);
  if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) throw new Error("Navigation must use public http or https URLs without credentials.");
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host === "169.254.169.254" || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) || host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) throw new Error("Navigation must not target localhost, private networks, or cloud metadata services.");
}

function assertAllowedNavigation(raw: string, rootUrl: string): void {
  assertSafeNavigation(raw);
  const root = new URL(rootUrl).hostname.toLowerCase();
  const target = new URL(raw).hostname.toLowerCase();
  if (target !== root && !target.endsWith(`.${root}`)) throw new Error(`Navigation is outside the teaching domain allowlist (${root}).`);
}

function sanitizeEvidence(value: unknown): TeachingEvidence | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  const text = (key: keyof TeachingEvidence, max: number) => typeof source[key] === "string" ? String(source[key]).trim().slice(0, max) || undefined : undefined;
  const evidence: TeachingEvidence = {};
  const fields: Array<[keyof TeachingEvidence, number]> = [["url", 2048], ["title", 300], ["selector", 500], ["text", 5000], ["screenshot_ref", 500]];
  for (const [key, max] of fields) { const value = text(key, max); if (value) evidence[key] = value; }
  return Object.values(evidence).some(Boolean) ? evidence : undefined;
}
