export type MockVariant = "v1" | "v2" | "v3";

export class MockPortal {
  #variant: MockVariant = "v1";

  get variant(): MockVariant {
    return this.#variant;
  }

  setVariant(value: string): MockVariant {
    if (value === "reset") value = "v1";
    if (!(["v1", "v2", "v3"] as string[]).includes(value)) {
      throw new Error("variant must be v1, v2, v3, or reset");
    }
    this.#variant = value as MockVariant;
    return this.#variant;
  }

  render(): string {
    const config = {
      v1: { inputId: "certificate-number", buttonId: "check-status", button: "Check Status", decoy: "" },
      v2: { inputId: "certificate-number", buttonId: "verify-now", button: "Verify Status", decoy: '<div id="cookie"><button type="button" onclick="this.parentElement.remove()">No thanks</button></div>' },
      v3: { inputId: "record-reference", buttonId: "find-record", button: "Find Record", decoy: '<input id="certificate-number" aria-label="Search help articles" />' },
    }[this.#variant];
    return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Cache-Control" content="no-store"><title>Demoland Certificate Status</title></head><body><marquee>DEMOLAND CERTIFICATE STATUS VERIFICATION</marquee>${config.decoy}<main><h1>Certificate Status</h1><label for="${config.inputId}">Certificate number</label><input id="${config.inputId}" name="certificate" maxlength="12"><button id="${config.buttonId}" type="button">${config.button}</button><pre id="result-json" hidden></pre></main><script>document.getElementById('${config.buttonId}').addEventListener('click',()=>{const value=document.getElementById('${config.inputId}').value;const result={certificate:value,status:value==='DEMO-404'?'not_found':'verified',holder:'Demo Citizen',issued_on:'2026-08-22'};const node=document.getElementById('result-json');node.textContent=JSON.stringify(result);node.hidden=false;});</script></body></html>`;
  }
}

export function renderBrowserFixture(scenario: string): string {
  const pages: Record<string, string> = {
    iframe: `<h1>Iframe fixture</h1><iframe title="Results frame" srcdoc='<table id="results"><tr><th>Name</th><th>Status</th></tr><tr><td>Alpha</td><td>Ready</td></tr></table>'></iframe>`,
    newtab: `<h1>New tab fixture</h1><button id="open-result" onclick="window.open('/mock/fixture?scenario=result','_blank')">Open Result</button>`,
    result: `<h1>Result window</h1><pre id="result-json">{"status":"ready","source":"new-tab"}</pre>`,
    dynamic: `<h1>Dynamic controls</h1><label for="category">Category</label><select id="category"><option>Alpha</option><option>Beta</option></select><div id="chosen"></div><script>document.getElementById('category').addEventListener('change',e=>document.getElementById('chosen').textContent=e.target.value)</script>`,
    empty: `<h1>Empty result fixture</h1><div id="empty-result"></div>`,
    login: `<h1>Account login</h1><label>Password<input type="password"></label>`,
    popup: `<div role="dialog"><button aria-label="Close popup" onclick="this.parentElement.remove()">Close</button></div><main><h1>Popup fixture</h1><button id="continue">Continue</button></main>`,
  };
  return `<!doctype html><html><head><meta charset="utf-8"><title>THRU ${escapeHtml(scenario)} fixture</title></head><body>${pages[scenario] ?? `<h1>Unknown fixture</h1>`}</body></html>`;
}

export function renderNadakacheriDemo(view: "prepare" | "status"): string {
  const notice = `<div class="demo-notice" role="note"><strong>FICTIONAL HACKATHON DEMO</strong><span>This is not a Karnataka Government website and does not submit any real application.</span></div>`;
  const styles = `<style>body{font:16px system-ui;margin:0;background:#f6f3ed;color:#172033}.demo-notice{padding:16px 24px;background:#fff1c2;border-bottom:2px solid #b7791f;display:flex;gap:12px;flex-wrap:wrap}main{max-width:760px;margin:40px auto;padding:28px;background:white;border:1px solid #d7dce3}label{display:grid;gap:6px;margin:14px 0}input,select,button{font:inherit;padding:10px}button{background:#15345b;color:white;border:0;margin-top:12px}pre{white-space:pre-wrap;background:#eef3f8;padding:16px}</style>`;
  const head = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Cache-Control" content="no-store"><title>Nadakacheri demo portal</title>${styles}</head><body>${notice}`;
  if (view === "status") return `${head}<main><h1>Demo certificate status</h1><p>Look up a reference created by the fictional income-certificate preparation flow.</p><label for="reference">Application reference<input id="reference" name="reference" aria-label="Application reference"></label><button id="check-certificate" type="button">Check certificate status</button><pre id="result-json" hidden></pre></main><script>document.getElementById('check-certificate').addEventListener('click',()=>{const reference=document.getElementById('reference').value;const result={reference,status:'certificate_issued',certificate_number:'INC-KA-2026-48291',issued_on:'2026-08-22'};const node=document.getElementById('result-json');node.textContent=JSON.stringify(result);node.hidden=false;});</script></body></html>`;
  return `${head}<main><h1>Prepare an income certificate application</h1><p>Review fictional details and prepare a demo-only application package.</p>
  <label for="applicant-name">Applicant name<input id="applicant-name" name="applicant_name"></label>
  <label for="date-of-birth">Date of birth<input id="date-of-birth" name="date_of_birth" type="date"></label>
  <label for="district">District<select id="district" name="district"><option>Bengaluru Urban</option><option>Mysuru</option><option>Dharwad</option></select></label>
  <label for="taluk">Taluk<input id="taluk" name="taluk"></label>
  <label for="annual-income">Annual income<input id="annual-income" name="annual_income" inputmode="numeric"></label>
  <label for="purpose">Purpose<input id="purpose" name="purpose"></label>
  ${["identity", "address", "income", "photo"].map((name) => `<label for="${name}-ready">${name[0]?.toUpperCase()}${name.slice(1)} document<select id="${name}-ready" name="${name}_ready"><option value="true">Ready</option><option value="false">Not ready</option></select></label>`).join("")}
  <button id="prepare-application" type="button">Prepare demo application</button><pre id="result-json" hidden></pre></main><script>document.getElementById('prepare-application').addEventListener('click',()=>{const result={reference:'INC-KA-48291',status:'ready_for_submission',prepared_at:'2026-08-22T10:30:00+05:30',next_action:'Review the prepared details and simulate submission in NammaDocs.'};const node=document.getElementById('result-json');node.textContent=JSON.stringify(result);node.hidden=false;});</script></body></html>`;
}

function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character); }
