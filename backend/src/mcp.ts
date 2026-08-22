import { McpServer } from "@modelcontextprotocol/server";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { z, type ZodType } from "zod/v4";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { SkillExecutor } from "./executor.js";
import type { SkillRegistry } from "./registry.js";
import type { JsonSchema } from "./types.js";

export async function handleMcpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  registry: SkillRegistry,
  executor: SkillExecutor,
): Promise<void> {
  const server = new McpServer({ name: "forge", version: "0.1.0" });
  const skills = registry.list();
  if (skills.length === 0) {
    server.registerTool("forge_help", {
      description: "Explains Forge when no website skills are installed.",
      inputSchema: z.object({}),
    }, async () => ({ content: [{ type: "text", text: "Forge has no skills yet. Forge or import a skill, then list tools again." }] }));
  }
  for (const skill of skills) {
    server.registerTool(`forge_${skill.skill.id.replaceAll("-", "_")}`, {
      title: skill.skill.name,
      description: skill.skill.description,
      inputSchema: schemaToZod(skill.contract.inputs) as ZodType<Record<string, unknown>>,
    }, async (inputs) => {
      const result = await executor.runSkill(skill.skill.id, inputs, "mcp");
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result as unknown as Record<string, unknown>,
        isError: result?.status === "portal_error" || result?.status === "invalid_input",
      };
    });
  }
  const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  await transport.handleRequest(req, res);
}

function schemaToZod(schema: JsonSchema): ZodType {
  let result: ZodType;
  switch (schema.type) {
    case "string":
      result = z.string();
      if (schema.pattern) result = (result as z.ZodString).regex(new RegExp(schema.pattern));
      break;
    case "integer": result = z.int(); break;
    case "number": result = z.number(); break;
    case "boolean": result = z.boolean(); break;
    case "array": result = z.array(schemaToZod(schema.items ?? { type: "string" })); break;
    case "object": {
      const required = new Set(schema.required ?? []);
      const shape = Object.fromEntries(Object.entries(schema.properties ?? {}).map(([key, value]) => {
        const field = schemaToZod(value);
        return [key, required.has(key) ? field : field.optional()];
      }));
      result = z.object(shape);
      break;
    }
    default: result = z.unknown();
  }
  return schema.description ? result.describe(schema.description) : result;
}
