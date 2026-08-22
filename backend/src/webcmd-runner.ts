import { spawn } from "node:child_process";
import path from "node:path";
import type { HealingEvent, RunExecutionContext, SkillArtifact, StepResult } from "./types.js";

interface BrowserPatch { readonly step: string; readonly selector: string; readonly previous: string; readonly rung: "relocate" | "reforge"; readonly note: string }
interface BrowserResult { readonly ok: boolean; readonly data?: unknown; readonly healing?: BrowserPatch[]; readonly needsHuman?: string; readonly error?: string; readonly narration?: string[]; readonly steps?: StepResult[] }
export interface WebcmdRunResult { readonly status: "success" | "healed_success" | "portal_error" | "needs_human"; readonly data: unknown; readonly healing: HealingEvent[]; readonly needsHuman: string | null; readonly narration: string[]; readonly patches: BrowserPatch[]; readonly steps: StepResult[] }
export interface PageObservation { readonly url: string; readonly title: string; readonly headings: string[]; readonly labels: string[]; readonly inputs: Array<{ name: string; type: string; placeholder: string }>; readonly buttons: string[]; readonly tables: string[] }

export async function inspectWithWebcmd(url: string, timeoutMs = 30_000): Promise<PageObservation> {
  let sessionId: string | null = null;
  try {
    const created = JSON.parse(await command(["--profile", "default", "session", "create", "-f", "json"])) as { id: string }; sessionId = created.id;
    const program = `await page.goto(${JSON.stringify(url)},{waitUntil:'domcontentloaded',timeout:${timeoutMs}});return await page.evaluate(()=>({url:location.href,title:document.title,headings:[...document.querySelectorAll('h1,h2,h3')].slice(0,20).map(x=>(x.textContent||'').trim()).filter(Boolean),labels:[...document.querySelectorAll('label')].slice(0,30).map(x=>(x.textContent||'').trim()).filter(Boolean),inputs:[...document.querySelectorAll('input,select,textarea')].slice(0,30).map(x=>({name:x.getAttribute('name')||x.id||'',type:x.getAttribute('type')||x.tagName.toLowerCase(),placeholder:x.getAttribute('placeholder')||''})),buttons:[...document.querySelectorAll('button,[role=button]')].slice(0,30).map(x=>(x.textContent||'').trim()).filter(Boolean),tables:[...document.querySelectorAll('table')].slice(0,10).map(x=>(x.innerText||'').slice(0,1000))}));`;
    const raw = await command(["--profile", "default", "--session", sessionId, "browser", "run", "--stdin", "--no-snapshot-diff", "--timeout", String(Math.ceil(timeoutMs / 1000)), "--max-output", "20000"], program, timeoutMs + 5_000);
    const response = JSON.parse(raw) as { ok: boolean; result?: PageObservation; error?: { message?: string } }; if (!response.ok || !response.result) throw new Error(response.error?.message ?? "Page reconnaissance failed."); return response.result;
  } finally { if (sessionId) await command(["--profile", "default", "session", "close", sessionId, "-f", "json"], undefined, 10_000).catch(() => undefined); }
}

export async function runWithWebcmd(skill: SkillArtifact, inputs: Record<string, unknown>, context: RunExecutionContext, internalBaseUrl?: string): Promise<WebcmdRunResult> {
  let sessionId: string | null = null;
  const budget = Math.min(90_000, Math.max(1_000, context.timeBudgetMs ?? (context.surface === "rest" ? 55_000 : 90_000)));
  try {
    const created = JSON.parse(await command(["--profile", "default", "session", "create", "-f", "json"])) as { id: string };
    sessionId = created.id;
    const raw = await command(["--profile", "default", "--session", sessionId, "browser", "run", "--stdin", "--no-snapshot-diff", "--timeout", String(Math.ceil(budget / 1000)), "--max-output", "30000"], buildProgram(skill, inputs, budget, internalBaseUrl), budget + 5_000);
    const response = JSON.parse(raw) as { ok: boolean; result?: BrowserResult; error?: { message?: string } };
    const result = response.result;
    if (!response.ok || !result) return failure(response.error?.message ?? "Webcmd returned no result.");
    const healing = (result.healing ?? []).map((item) => ({ step: item.step, rung: item.rung, note: item.note, at: new Date().toISOString() } satisfies HealingEvent));
    return { status: result.needsHuman ? "needs_human" : result.ok ? (healing.length ? "healed_success" : "success") : "portal_error", data: result.data ?? null, healing, needsHuman: result.needsHuman ?? null, narration: result.narration ?? [], patches: result.healing ?? [], steps: result.steps ?? [] };
  } catch (error) { return failure(error instanceof Error ? error.message : "Webcmd execution failed."); }
  finally { if (sessionId) await command(["--profile", "default", "session", "close", sessionId, "-f", "json"], undefined, 10_000).catch(() => undefined); }
}

function failure(message: string): WebcmdRunResult {
  return { status: "portal_error", data: null, healing: [{ step: "browser", rung: "retry", note: message.slice(0, 300), at: new Date().toISOString() }], needsHuman: null, narration: ["The browser workflow stopped safely."], patches: [], steps: [] };
}

function command(args: string[], stdin?: string, timeout = 15_000): Promise<string> {
  const cli = path.resolve("node_modules/@agentrhq/webcmd/dist/src/main.js");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    const stdout: Buffer[] = []; const stderr: Buffer[] = []; let settled = false;
    const finish = (fn: () => void) => { if (!settled) { settled = true; fn(); } };
    const timer = setTimeout(() => { child.kill(); finish(() => reject(new Error("Webcmd command exceeded its Forge budget."))); }, timeout);
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk)); child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk)); child.on("error", (error) => finish(() => reject(error)));
    child.on("close", (code) => finish(() => { clearTimeout(timer); const output = Buffer.concat(stdout).toString("utf8").trim(); if (code === 0) resolve(output); else reject(new Error(Buffer.concat(stderr).toString("utf8").trim() || output || `webcmd exited ${code}`)); }));
    child.stdin.end(stdin);
  });
}

function buildProgram(skill: SkillArtifact, inputs: Record<string, unknown>, budget: number, internalBaseUrl?: string): string {
  const site = skill.skill.site.domain === "forge-internal" && internalBaseUrl ? internalBaseUrl : /^https?:\/\//.test(skill.skill.site.domain) ? skill.skill.site.domain : `https://${skill.skill.site.domain}`;
  return `
const skill=${JSON.stringify(skill)};const inputs=${JSON.stringify(inputs)};const site=${JSON.stringify(site)};const budget=${budget};const started=Date.now();const healing=[];const narration=[];const steps=[];let data=null;
const left=()=>budget-(Date.now()-started);const value=p=>p.split('.').reduce((v,k)=>v==null?v:v[k],{inputs});const interpolate=s=>String(s||'').replace(/\\{site\\}/g,site).replace(/\\{inputs\\.([a-zA-Z0-9_-]+)\\}/g,(_,k)=>encodeURIComponent(String(inputs[k]??'')));
const loc=s=>s.startsWith('text:')?page.getByText(s.slice(5),{exact:true}):s.startsWith('label:')?page.getByLabel(s.slice(6),{exact:false}):page.locator(s);const present=async s=>{try{return await loc(s).count()>0}catch{return false}};
const tokens=s=>String(s).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);const similarity=(a,b)=>{const x=tokens(a),y=tokens(b),u=new Set([...x,...y]);return [...u].filter(v=>x.includes(v)&&y.includes(v)).length/Math.max(u.size,1)};
const choose=async step=>{for(const s of [step.selector_primary,...(step.selector_fallbacks||[])].filter(Boolean))if(await present(s))return{selector:s,rung:s===step.selector_primary?null:'relocate'};const labels=step.action==='fill'?await page.locator('label').allTextContents():await page.getByRole(step.action==='click'?'button':'link').allTextContents();let best=null;for(const label of labels){const score=similarity(step.target_description,label);if(!best||score>best.score)best={label,score}}if(best&&best.score>=0.8)return{selector:(step.action==='fill'?'label:':'text:')+best.label,rung:'relocate'};if(step.action==='click'){const buttons=await page.getByRole('button').allTextContents();if(buttons.length===1)return{selector:'text:'+buttons[0],rung:'reforge'}}return null};
const verify=async e=>{const body=await page.locator('body').innerText();if(e.contains&&!e.contains.every(x=>body.includes(x)))return false;if(e.not_contains&&e.not_contains.some(x=>body.toLowerCase().includes(String(x).toLowerCase())))return false;if(e.url_contains&&!page.url().includes(e.url_contains))return false;if(e.element_present&&!(await present(e.element_present)))return false;if(e.field_value_equals&&await page.locator(':focus').inputValue()!==String(value(e.field_value_equals)))return false;if(e.min_items&&await page.locator(e.min_items.path).count()<e.min_items.count)return false;return true};
for(const step of skill.workflow.steps){const ss=Date.now();let selected=null,drift='none';const line=('Running '+step.target_description+'...').slice(0,160);narration.push(line);if(left()<=0)return{ok:false,error:'Global budget exhausted.',healing,narration,steps};if(step.action!=='navigate'){const body=(await page.locator('body').innerText()).toLowerCase();if(await page.locator('input[type=password]').count()>0||/\\b(captcha|one.time password|otp|sign in|log in|payment details)\\b/.test(body)){steps.push({step:step.id,action:step.action,narration:line,selected_locator:null,expectation_met:false,drift:'blocked',timing_ms:Date.now()-ss});return{ok:false,needsHuman:'The site requires login, OTP, captcha, or payment input.',healing,narration,steps}}}try{if(step.action==='navigate'){let opened=false,last='';for(const delay of [0,2000,5000,10000]){if(delay){if(left()<delay)break;await page.waitForTimeout(delay)}try{await page.goto(interpolate(step.url||site),{waitUntil:'domcontentloaded',timeout:Math.min(step.timeout_ms,left())});opened=true;break}catch(e){last=String(e);healing.push({step:step.id,selector:'navigation',previous:'navigation',rung:'relocate',note:'Retry after '+delay+'ms: '+last.slice(0,100)})}}if(!opened)throw new Error('Navigation failed after bounded retries')}else{const pick=await choose(step);if(!pick)throw new Error('Target is missing: '+step.target_description);selected=pick.selector;if(pick.rung){drift=pick.rung==='reforge'?'semantic':'missing';healing.push({step:step.id,selector:pick.selector,previous:step.selector_primary||'',rung:pick.rung,note:'Verified '+pick.selector+' by fallback or semantic relocation.'})}const target=loc(pick.selector);if(step.action==='fill')await target.fill(String(value(step.value_from)));if(step.action==='click'){for(const close of ['button[aria-label*=close i]','button:has-text("Dismiss")','button:has-text("Close")'])if(await present(close))await loc(close).click().catch(()=>{});const before=context.pages().length;await target.click();const pages=context.pages();if(pages.length>before)page=pages[pages.length-1]}if(step.action==='extract'){const s=step.extraction&&step.extraction.selector||pick.selector;const text=await loc(s).innerText();data=step.extraction&&step.extraction.strategy==='json_element'?JSON.parse(text):{text}}}if(!(await verify(step.expect)))throw new Error('Expectation failed after '+step.id);steps.push({step:step.id,action:step.action,narration:line,selected_locator:selected,expectation_met:true,drift,timing_ms:Date.now()-ss})}catch(e){steps.push({step:step.id,action:step.action,narration:line,selected_locator:selected,expectation_met:false,drift:'expectation',timing_ms:Date.now()-ss});return{ok:false,error:String(e),healing,narration,steps}}}return{ok:true,data,healing,narration,steps};`;
}
