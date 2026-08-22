#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import path from "node:path";
import { loadConfig } from "./config.js";
import { SkillExecutor } from "./executor.js";
import { ForgeEngine } from "./forge-engine.js";
import { modelFromEnvironment } from "./forge-model.js";
import { SkillRegistry } from "./registry.js";
import { refreshWebcmdDiagnostic } from "./webcmd-diagnostic.js";

class UsageError extends Error {}

const [command, ...args] = process.argv.slice(2);
const config = loadConfig();
const registry = new SkillRegistry(config.skillsDirectory);
await registry.load();
const executor = new SkillExecutor(registry, `http://127.0.0.1:${config.port}`);
const forgeEngine = new ForgeEngine(registry, modelFromEnvironment());

try {
  switch (command) {
    case "list":
      for (const item of registry.list()) console.log(`${item.skill.id}\t${item.skill.name}\tv${item.skill.version}`);
      break;
    case "run": {
      const id = required(args.shift(), "Usage: forge run <skill-id> [key=value ...]");
      const inputs = Object.fromEntries(args.map((pair) => {
        const index = pair.indexOf("=");
        if (index < 1) throw new UsageError(`Input must be key=value: ${pair}`);
        return [pair.slice(0, index), pair.slice(index + 1)];
      }));
      const result = await executor.runSkill(id, inputs, { surface: "local_human", timeBudgetMs: 90_000, narrationSink: (line) => console.error(line), humanGate: async (gate) => {
        const terminal = createInterface({ input: process.stdin, output: process.stderr });
        try {
          if (gate.kind === "manual") { console.error("Login, CAPTCHA, and OTP automation are outside the Forge MVP. No sensitive value was requested."); return false; }
          return (await terminal.question(`Sensitive action: ${gate.reason}. Type exactly APPROVE to continue: `)) === "APPROVE";
        } finally { terminal.close(); }
      } });
      if (!result) throw new Error(`Skill not found: ${id}`);
      for (const line of result.narration ?? []) console.error(line);
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = result.status === "invalid_input" ? 2 : result.status === "needs_human" ? 3 : result.status === "portal_error" ? 1 : 0;
      break;
    }
    case "export": {
      const id = required(args.shift(), "Usage: forge export <skill-id> [file]");
      const skill = registry.get(id);
      if (!skill) throw new Error(`Skill not found: ${id}`);
      const output = `${JSON.stringify(skill, null, 2)}\n`;
      if (args[0]) await writeFile(path.resolve(args[0]), output, "utf8");
      else process.stdout.write(output);
      break;
    }
    case "import": {
      const file = required(args.shift(), "Usage: forge import <file.skill.json>");
      const imported = await registry.import(JSON.parse(await readFile(path.resolve(file), "utf8")));
      console.log(`Skill imported: ${imported.skill.id}`);
      break;
    }
    case "new": {
      const url = required(args.shift(), "Usage: forge new <url> <goal text>"); const goal_text = required(args.join(" "), "Usage: forge new <url> <goal text>");
      const proposal = await forgeEngine.propose({ url, goal_text }); console.error(JSON.stringify(proposal.artifact, null, 2)); for (const question of proposal.questions) console.error(`Question: ${question}`);
      const terminal = createInterface({ input: process.stdin, output: process.stderr }); const answer = await terminal.question("Type exactly CONFIRM to save this proposal: "); terminal.close(); if (answer !== "CONFIRM") { forgeEngine.discard(proposal.proposal_id); throw new Error("Proposal discarded without changing the registry."); }
      const imported = await forgeEngine.confirm(proposal.proposal_id); console.log(JSON.stringify({ status: "forged", skill: imported }, null, 2));
      break;
    }
    case "doctor": {
      const result = await refreshWebcmdDiagnostic();
      console.log(JSON.stringify({ ...result, skills: registry.list().length, skillsDirectory: config.skillsDirectory }, null, 2));
      process.exitCode = result.status === "ready" ? 0 : 1;
      break;
    }
    default:
      console.log("Forge commands: list | run | new | import | export | doctor");
      process.exitCode = command ? 2 : 0;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Forge command failed.");
  process.exitCode = error instanceof UsageError ? 2 : 1;
}

function required(value: string | undefined, message: string): string {
  if (!value) throw new UsageError(message);
  return value;
}
