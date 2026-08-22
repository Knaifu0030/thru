#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "./config.js";
import { SkillExecutor } from "./executor.js";
import { MockPortal } from "./mock-portal.js";
import { SkillRegistry } from "./registry.js";
import { refreshWebcmdDiagnostic } from "./webcmd-diagnostic.js";

const [command, ...args] = process.argv.slice(2);
const config = loadConfig();
const registry = new SkillRegistry(config.skillsDirectory);
await registry.load();
const executor = new SkillExecutor(registry, new MockPortal());

try {
  switch (command) {
    case "list":
      for (const item of registry.list()) console.log(`${item.skill.id}\t${item.skill.name}\tv${item.skill.version}`);
      break;
    case "run": {
      const id = required(args.shift(), "Usage: forge run <skill-id> [key=value ...]");
      const inputs = Object.fromEntries(args.map((pair) => {
        const index = pair.indexOf("=");
        if (index < 1) throw new Error(`Input must be key=value: ${pair}`);
        return [pair.slice(0, index), pair.slice(index + 1)];
      }));
      const result = await executor.runSkill(id, inputs, "local_human");
      if (!result) throw new Error(`Skill not found: ${id}`);
      for (const line of result.narration ?? []) console.error(line);
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = result.status === "portal_error" ? 1 : 0;
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
      const file = required(args.shift(), "Usage: forge new <confirmed-artifact.skill.json>");
      const imported = await registry.import(JSON.parse(await readFile(path.resolve(file), "utf8")));
      console.log(`Skill forged: ${imported.skill.id} v${imported.skill.version}`);
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
      process.exitCode = command ? 1 : 0;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Forge command failed.");
  process.exitCode = 1;
}

function required(value: string | undefined, message: string): string {
  if (!value) throw new Error(message);
  return value;
}
