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
void checkConnection().then(loadSkills);

async function loadSkills() {
  const status = document.querySelector("#marketplace-status");
  const list = document.querySelector("#skill-list");
  try {
    const response = await fetch(`${apiBase}/registry`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    list.replaceChildren(...body.skills.map(renderSkill));
    status.textContent = `${body.skills.length} available`;
  } catch (error) {
    status.textContent = `Registry unavailable: ${error instanceof Error ? error.message : "unknown error"}`;
  }
}

function renderSkill(artifact) {
  const section = document.createElement("article");
  section.className = "skill";
  const header = document.createElement("header");
  const copy = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = `${artifact.skill.sensitive ? "🔒 " : ""}${artifact.skill.name}`;
  const description = document.createElement("p");
  description.textContent = artifact.skill.description;
  const stats = document.createElement("p");
  stats.textContent = `v${artifact.skill.version} · ${artifact.vitals.runs} runs · ${artifact.vitals.healed_runs} healed`;
  copy.append(title, description);
  header.append(copy, stats);

  const form = document.createElement("form");
  for (const [name, schema] of Object.entries(artifact.contract.inputs.properties || {})) {
    const label = document.createElement("label");
    label.textContent = schema.description || name;
    const input = document.createElement("input");
    input.name = name;
    input.required = (artifact.contract.inputs.required || []).includes(name);
    if (schema.pattern) input.pattern = schema.pattern;
    input.type = schema.type === "number" || schema.type === "integer" ? "number" : "text";
    label.append(input);
    form.append(label);
  }
  const button = document.createElement("button");
  button.type = "submit";
  button.textContent = "Run skill";
  form.append(button);
  const result = document.createElement("pre");
  result.hidden = true;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    button.disabled = true;
    result.hidden = false;
    result.textContent = "Running…";
    try {
      const inputs = Object.fromEntries(new FormData(form));
      const response = await fetch(`${apiBase}/skills/${artifact.skill.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inputs),
      });
      result.textContent = JSON.stringify(await response.json(), null, 2);
      await loadSkills();
    } catch (error) {
      result.textContent = `Run failed: ${error instanceof Error ? error.message : "unknown error"}`;
    } finally {
      button.disabled = false;
    }
  });

  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = "API and agent usage";
  const usage = document.createElement("pre");
  usage.textContent = `POST ${apiBase}/skills/${artifact.skill.id}\nMCP tool: forge_${artifact.skill.id.replaceAll("-", "_")}`;
  details.append(summary, usage);
  section.append(header, form, result, details);
  return section;
}
