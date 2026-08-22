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

