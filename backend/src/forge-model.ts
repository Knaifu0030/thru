export interface ForgeModelInput { readonly goal_text: string; readonly url: string; readonly sample_inputs?: Record<string, unknown>; readonly observation: unknown; readonly deterministic_artifact: unknown }
export interface ForgeModel { propose(input: ForgeModelInput): Promise<unknown> }

export class AzureOpenAIForgeModel implements ForgeModel {
  constructor(private readonly config: { endpoint: string; apiKey: string; deployment: string; apiVersion: string }) {}
  async propose(input: ForgeModelInput): Promise<unknown> {
    const endpoint = this.config.endpoint.replace(/\/$/, "");
    const url = `${endpoint}/openai/deployments/${encodeURIComponent(this.config.deployment)}/chat/completions?api-version=${encodeURIComponent(this.config.apiVersion)}`;
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "api-key": this.config.apiKey }, body: JSON.stringify({ messages: [{ role: "system", content: "Return one credential-free Forge v1 skill artifact. Mark every login, OTP, captcha, submit, payment, send, or delete step sensitive. Do not invent controls absent from the observation." }, { role: "user", content: JSON.stringify(input) }], response_format: { type: "json_schema", json_schema: { name: "forge_skill_artifact", strict: false, schema: { type: "object", required: ["forge_spec", "skill", "contract", "workflow", "vitals", "history"], additionalProperties: true } } } }) });
    if (!response.ok) throw new Error(`Azure OpenAI returned ${response.status}.`);
    const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> }; const content = body.choices?.[0]?.message?.content; if (!content) throw new Error("Azure OpenAI returned no structured proposal.");
    try { return JSON.parse(content); } catch { throw new Error("Azure OpenAI returned malformed JSON."); }
  }
}

export function modelFromEnvironment(env: NodeJS.ProcessEnv = process.env): ForgeModel | null {
  const endpoint = env.AZURE_OPENAI_ENDPOINT?.trim(), apiKey = env.AZURE_OPENAI_API_KEY?.trim(), deployment = env.AZURE_OPENAI_DEPLOYMENT?.trim(), apiVersion = env.AZURE_OPENAI_API_VERSION?.trim();
  return endpoint && apiKey && deployment && apiVersion ? new AzureOpenAIForgeModel({ endpoint, apiKey, deployment, apiVersion }) : null;
}
