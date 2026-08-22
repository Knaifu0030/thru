const apiBase = String(window.FORGE_API_BASE || "").replace(/\/$/, "");
const elements = {
  signal: document.querySelector("#signal"),
  label: document.querySelector("#status-label"),
  title: document.querySelector("#status-title"),
  message: document.querySelector("#status-message"),
  readout: document.querySelector("#readout"),
  backend: document.querySelector("#backend-value"),
  webcmd: document.querySelector("#webcmd-value"),
  origin: document.querySelector("#origin-value"),
  retry: document.querySelector("#retry"),
};

async function checkConnection() {
  elements.readout.setAttribute("aria-busy", "true");
  elements.signal.dataset.state = "checking";
  elements.label.textContent = "Checking production link…";
  elements.backend.textContent = "Connecting";
  elements.webcmd.textContent = "Checking";
  elements.origin.textContent = apiBase || "Not configured";
  elements.retry.hidden = true;

  if (!apiBase) {
    showFailure("The frontend has no API base configured.");
    return;
  }

  try {
    const response = await fetch(`${apiBase}/hello`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error?.message || `HTTP ${response.status}`);

    elements.signal.dataset.state = "online";
    elements.label.textContent = "Production path confirmed";
    elements.title.textContent = "Forge deployment online.";
    elements.message.textContent =
      "The static marketplace reached its backend across origins. The foundation is live; feature work can begin.";
    elements.backend.textContent = `${body.service} / ${body.version}`;
    elements.webcmd.textContent = body.webcmd?.version
      ? `${body.webcmd.version} / ${body.webcmd.status}`
      : body.webcmd?.status || "degraded";
    elements.readout.setAttribute("aria-busy", "false");
  } catch (error) {
    showFailure(error instanceof Error ? error.message : "Unknown connection error");
  }
}

function showFailure(detail) {
  elements.signal.dataset.state = "offline";
  elements.label.textContent = "Production path needs attention";
  elements.title.textContent = "The connection did not complete.";
  elements.message.textContent = `Forge could not reach its backend: ${detail}`;
  elements.backend.textContent = "Unavailable";
  elements.webcmd.textContent = "Not checked";
  elements.readout.setAttribute("aria-busy", "false");
  elements.retry.hidden = false;
}

elements.retry.addEventListener("click", checkConnection);
void checkConnection();

