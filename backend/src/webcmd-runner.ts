import { spawn } from "node:child_process";
import path from "node:path";
import { GLOBAL_RUN_BUDGET_MS, REST_RUN_BUDGET_MS } from "./execution-policy.js";
import type { HealingEvent, RunExecutionContext, SkillArtifact, StepResult } from "./types.js";

interface BrowserPatch { readonly step: string; readonly selector: string; readonly previous: string; readonly rung: "relocate" | "reforge"; readonly note: string }
interface BrowserHealing { readonly step: string; readonly rung: "retry" | "relocate" | "reforge"; readonly note: string }
interface BrowserResult { readonly ok: boolean; readonly data?: unknown; readonly healing?: BrowserHealing[]; readonly patches?: BrowserPatch[]; readonly needsHuman?: string; readonly error?: string; readonly narration?: string[]; readonly steps?: StepResult[] }
export interface WebcmdRunResult { readonly status: "success" | "healed_success" | "portal_error" | "needs_human"; readonly data: unknown; readonly healing: HealingEvent[]; readonly needsHuman: string | null; readonly narration: string[]; readonly patches: BrowserPatch[]; readonly steps: StepResult[] }
export interface PageObservation { readonly url: string; readonly title: string; readonly headings: string[]; readonly labels: string[]; readonly inputs: Array<{ name: string; type: string; placeholder: string; id: string; ariaLabel: string }>; readonly buttons: string[]; readonly tables: string[] }

export class WebcmdSession {
  private constructor(readonly id: string) {}
  static async create(): Promise<WebcmdSession> { const created = JSON.parse(await command(["--profile", "default", "session", "create", "-f", "json"])) as { id: string }; return new WebcmdSession(created.id); }
  async run(skill: SkillArtifact, inputs: Record<string, unknown>, budget = GLOBAL_RUN_BUDGET_MS, internalBaseUrl?: string): Promise<WebcmdRunResult> { try { return normalize(await this.runRaw<BrowserResult>(buildProgram(skill, inputs, budget, internalBaseUrl))); } catch (error) { return failure(error instanceof Error ? error.message : "Webcmd execution failed."); } }
  async runRaw<T>(program: string, timeoutMs = GLOBAL_RUN_BUDGET_MS): Promise<T> { return parseBrowserResponse<T>(await runBrowser(this.id, program, timeoutMs)); }
  async close(): Promise<void> { await command(["--profile", "default", "session", "close", this.id, "-f", "json"], undefined, 10_000); }
}

export async function inspectWithWebcmd(url: string, timeoutMs = 30_000): Promise<PageObservation> {
  return withSession(timeoutMs, async (sessionId) => {
    const program = `await page.goto(${JSON.stringify(url)},{waitUntil:'domcontentloaded',timeout:${timeoutMs}});return await page.evaluate(()=>({url:location.href,title:document.title,headings:[...document.querySelectorAll('h1,h2,h3')].slice(0,20).map(x=>(x.textContent||'').trim()).filter(Boolean),labels:[...document.querySelectorAll('label')].slice(0,30).map(x=>(x.textContent||'').trim()).filter(Boolean),inputs:[...document.querySelectorAll('input,select,textarea')].slice(0,30).map(x=>({name:x.getAttribute('name')||'',type:x.getAttribute('type')||x.tagName.toLowerCase(),placeholder:x.getAttribute('placeholder')||'',id:x.id||'',ariaLabel:x.getAttribute('aria-label')||''})),buttons:[...document.querySelectorAll('button,[role=button]')].slice(0,30).map(x=>(x.textContent||x.getAttribute('aria-label')||'').trim()).filter(Boolean),tables:[...document.querySelectorAll('table')].slice(0,10).map(x=>(x.innerText||'').slice(0,1000))}));`;
    return parseBrowserResponse<PageObservation>(await runBrowser(sessionId, program, timeoutMs));
  });
}

export async function runWithWebcmd(skill: SkillArtifact, inputs: Record<string, unknown>, context: RunExecutionContext, internalBaseUrl?: string): Promise<WebcmdRunResult> {
  const budget = Math.min(GLOBAL_RUN_BUDGET_MS, Math.max(1_000, context.timeBudgetMs ?? (context.surface === "rest" ? REST_RUN_BUDGET_MS : GLOBAL_RUN_BUDGET_MS)));
  try {
    const result = await withSession(budget, async (sessionId) => parseBrowserResponse<BrowserResult>(await runBrowser(sessionId, buildProgram(skill, inputs, budget, internalBaseUrl), budget)));
    return normalize(result);
  } catch (error) { return failure(error instanceof Error ? error.message : "Webcmd execution failed."); }
}

function normalize(result: BrowserResult): WebcmdRunResult { const healing = (result.healing ?? []).map((event) => ({ ...event, at: new Date().toISOString() })); return { status: result.needsHuman ? "needs_human" : result.ok ? (healing.length ? "healed_success" : "success") : "portal_error", data: result.data ?? null, healing, needsHuman: result.needsHuman ?? null, narration: result.narration ?? [], patches: result.patches ?? [], steps: result.steps ?? [] }; }

async function withSession<T>(timeoutMs: number, operation: (sessionId: string) => Promise<T>): Promise<T> {
  let sessionId: string | null = null;
  try { const created = JSON.parse(await command(["--profile", "default", "session", "create", "-f", "json"])) as { id: string }; sessionId = created.id; return await operation(sessionId); }
  finally { if (sessionId) await command(["--profile", "default", "session", "close", sessionId, "-f", "json"], undefined, Math.min(10_000, timeoutMs)).catch(() => undefined); }
}

function parseBrowserResponse<T>(raw: string): T {
  const response = JSON.parse(raw) as { ok: boolean; result?: T; error?: { message?: string } }; if (!response.ok || response.result === undefined) throw new Error(response.error?.message ?? "Webcmd returned no result."); return response.result;
}

function runBrowser(sessionId: string, program: string, timeoutMs: number): Promise<string> {
  return command(["--profile", "default", "--session", sessionId, "browser", "run", "--stdin", "--no-snapshot-diff", "--timeout", String(Math.ceil(timeoutMs / 1000)), "--max-output", "40000"], program, timeoutMs + 5_000);
}

function failure(message: string): WebcmdRunResult { return { status: "portal_error", data: null, healing: [{ step: "browser", rung: "retry", note: message.slice(0, 300), at: new Date().toISOString() }], needsHuman: null, narration: ["The browser workflow stopped safely."], patches: [], steps: [] }; }

function command(args: string[], stdin?: string, timeout = 15_000): Promise<string> {
  const cli = path.resolve("node_modules/@agentrhq/webcmd/dist/src/main.js");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] }); const stdout: Buffer[] = [], stderr: Buffer[] = []; let settled = false;
    const finish = (callback: () => void) => { if (!settled) { settled = true; callback(); } }; const timer = setTimeout(() => { child.kill(); finish(() => reject(new Error("Webcmd command exceeded its THRU budget."))); }, timeout);
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk)); child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk)); child.on("error", (error) => finish(() => reject(error)));
    child.on("close", (code) => finish(() => { clearTimeout(timer); const output = Buffer.concat(stdout).toString("utf8").trim(); code === 0 ? resolve(output) : reject(new Error(Buffer.concat(stderr).toString("utf8").trim() || output || `webcmd exited ${code}`)); })); child.stdin.end(stdin);
  });
}

export function buildProgram(skill: SkillArtifact, inputs: Record<string, unknown>, budget: number, internalBaseUrl?: string): string {
  const site = skill.skill.site.domain === "thru-internal" && internalBaseUrl ? internalBaseUrl : /^https?:\/\//.test(skill.skill.site.domain) ? skill.skill.site.domain : `https://${skill.skill.site.domain}`;
  return `
const skill=${JSON.stringify(skill)};const inputs=${JSON.stringify(inputs)};const site=${JSON.stringify(site)};const budget=${budget};const started=Date.now();const deadline=started+budget;const reforgeDeadline=()=>Math.min(deadline,Date.now()+45000);const healing=[];const patches=[];const narration=[];const steps=[];let data=null;
const left=()=>deadline-Date.now();const bounded=s=>String(s).trim().slice(0,160);const value=p=>String(p||'').split('.').reduce((v,k)=>v==null?v:v[k],{inputs});const interpolate=s=>String(s||'').replace(/\\{site\\}/g,site).replace(/\\{inputs\\.([a-zA-Z0-9_-]+)\\}/g,(_,k)=>encodeURIComponent(String(inputs[k]??'')));
const tokens=s=>[...new Set(String(s).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean))];const similarity=(a,b)=>{const x=tokens(a),y=tokens(b),u=new Set([...x,...y]);return [...u].filter(w=>x.includes(w)&&y.includes(w)).length/Math.max(u.size,1)};
const scopes=()=>[page,...page.frames().filter(f=>f!==page.mainFrame())];const make=(scope,s)=>s.startsWith('text:')?scope.getByText(s.slice(5),{exact:true}):s.startsWith('label:')?scope.getByLabel(s.slice(6),{exact:false}):scope.locator(s);
const resolve=async s=>{for(const scope of scopes()){try{const candidate=make(scope,s);if(await candidate.count()>0)return candidate}catch{}}return null};const present=async s=>Boolean(await resolve(s));
const verify=async(e,requireVisible=true)=>{let body='';for(const scope of scopes())try{body+='\\\\n'+await scope.locator('body').innerText({timeout:Math.max(1,Math.min(left(),2000))})}catch{}if(e.contains&&!e.contains.every(x=>body.includes(x)))return false;if(e.not_contains&&e.not_contains.some(x=>body.toLowerCase().includes(String(x).toLowerCase())))return false;if(e.url_contains&&!page.url().includes(e.url_contains))return false;if(e.element_present){const expected=await resolve(e.element_present);if(!expected||requireVisible&&!await expected.first().isVisible())return false}if(e.field_value_equals){let matched=false;for(const scope of scopes())try{const fields=scope.locator('input,select,textarea');for(let i=0;i<await fields.count();i++)if(await fields.nth(i).inputValue()===String(value(e.field_value_equals)))matched=true}catch{}if(!matched)return false}if(e.min_items){const found=await resolve(e.min_items.path);if(!found||await found.count()<e.min_items.count)return false}return true};
const blocked=async()=>{let body='';for(const scope of scopes())try{body+=' '+(await scope.locator('body').innerText({timeout:1000})).toLowerCase()}catch{}for(const scope of scopes())if(await scope.locator('input[type=password]').count())return true;return /\\b(captcha|one.time password|otp|sign in|log in|payment details)\\b/.test(body)};
const dismiss=async()=>{for(const selector of ['button[aria-label*=close i]','button:has-text("Dismiss")','button:has-text("No thanks")','button:has-text("Close")']){const target=await resolve(selector);if(target)try{await target.first().click({timeout:1000})}catch{}}};
const choose=async step=>{for(const selector of [step.selector_primary,...(step.selector_fallbacks||[])].filter(Boolean)){const target=await resolve(selector);if(target)return{selector,target,rung:selector===step.selector_primary?null:'relocate'}}const until=reforgeDeadline();const candidates=[];for(const scope of scopes()){const query=step.action==='fill'?scope.locator('label'):scope.getByRole(step.action==='click'?'button':'link');for(const label of await query.allTextContents())candidates.push(label)}let best=null;for(const label of candidates){const score=similarity(step.target_description,label);if(!best||score>best.score)best={label,score}}if(best&&best.score>=0.8){const selector=(step.action==='fill'?'label:':'text:')+best.label;return{selector,target:await resolve(selector),rung:'relocate'}}if(Date.now()<until&&step.action==='click'){const viable=[];for(const scope of scopes())for(const label of await scope.getByRole('button').allTextContents())if(!/close|dismiss|no thanks|cancel/i.test(label))viable.push(label);if(viable.length===1){const selector='text:'+viable[0];return{selector,target:await resolve(selector),rung:'reforge'}}}return null};
const extract=async(step,target)=>{if(step.extraction&&step.extraction.strategy==='json_element')return JSON.parse(await target.innerText());if(await target.locator('table').count()||await target.evaluate(el=>el.tagName==='TABLE')){const table=await target.evaluate(root=>{const table=root.tagName==='TABLE'?root:root.querySelector('table');if(!table)return[];const rows=[...table.querySelectorAll('tr')].map(row=>[...row.querySelectorAll('th,td')].map(cell=>(cell.textContent||'').trim()));if(!rows.length)return[];const headers=rows[0];return rows.slice(1).filter(row=>row.some(Boolean)).map(row=>Object.fromEntries(headers.map((header,index)=>[header||('column_'+(index+1)),row[index]||''])))});return{items:table}}const text=(await target.innerText()).trim();return{text,empty:text.length===0}};
for(let index=0;index<skill.workflow.steps.length;index++){const step=skill.workflow.steps[index],ss=Date.now(),line=bounded('Running '+step.target_description+'...');narration.push(line);let selected=null,drift='none';if(left()<=0){steps.push({step:step.id,action:step.action,narration:line,selected_locator:null,expectation_met:false,drift:'hostile',timing_ms:Date.now()-ss});return{ok:false,error:'Global 90-second budget exhausted.',healing,patches,narration,steps}}if(step.action!=='navigate'&&await blocked()){steps.push({step:step.id,action:step.action,narration:line,selected_locator:null,expectation_met:false,drift:'blocked',timing_ms:Date.now()-ss});return{ok:false,needsHuman:'The site requires login, OTP, captcha, or payment input.',healing,patches,narration,steps}}
try{if(step.action==='navigate'){let opened=false,last='';for(const delay of [0,2000,5000,10000]){if(delay){if(left()<=delay)break;await page.waitForTimeout(delay)}try{await page.goto(interpolate(step.url||site),{waitUntil:'domcontentloaded',timeout:Math.max(1,Math.min(step.timeout_ms,left()))});opened=true;break}catch(e){last=String(e);healing.push({step:step.id,rung:'retry',note:bounded('Navigation retry after '+delay+'ms: '+last)})}}if(!opened)throw new Error('Navigation failed after bounded retries')}else{await dismiss();const pick=await choose(step);if(!pick||!pick.target)throw new Error('Target is missing: '+step.target_description);selected=pick.selector;if(pick.rung){drift=pick.rung==='reforge'?'semantic':'missing';const note=bounded('Verified '+pick.selector+' by fallback or semantic relocation.');healing.push({step:step.id,rung:pick.rung,note});patches.push({step:step.id,selector:pick.selector,previous:step.selector_primary||'',rung:pick.rung,note})}if(step.action==='fill'){const raw=String(value(step.value_from));const tag=await pick.target.evaluate(el=>el.tagName);if(tag==='SELECT')await pick.target.selectOption({label:raw}).catch(async()=>pick.target.selectOption(raw));else await pick.target.fill(raw)}if(step.action==='click'){if(await verify(step.expect)){narration.push(bounded('Expectation already satisfied; skipped duplicate click for '+step.id+'.'))}else{const before=context.pages().length;await pick.target.click({timeout:Math.max(1,Math.min(step.timeout_ms,left()))});await page.waitForTimeout(100);const pages=context.pages();if(pages.length>before)page=pages[pages.length-1]}}if(step.action==='extract')data=await extract(step,pick.target)}const met=await verify(step.expect);if(!met)throw new Error('Expectation failed after '+step.id);steps.push({step:step.id,action:step.action,narration:line,selected_locator:selected,expectation_met:true,drift,timing_ms:Date.now()-ss})}catch(e){steps.push({step:step.id,action:step.action,narration:line,selected_locator:selected,expectation_met:false,drift:selected?'expectation':'missing',timing_ms:Date.now()-ss});return{ok:false,error:bounded(String(e)),healing,patches,narration,steps}}}return{ok:true,data,healing,patches,narration,steps};`;
}
