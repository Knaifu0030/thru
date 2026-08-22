import { loadConfig } from "./config.js";
import { SkillExecutor } from "./executor.js";
import { createForgeServer } from "./app.js";
import { MockPortal } from "./mock-portal.js";
import { ForgeEngine } from "./forge-engine.js";
import { modelFromEnvironment } from "./forge-model.js";
import { RunManager } from "./run-manager.js";
import { SkillRegistry } from "./registry.js";
import { refreshWebcmdDiagnostic } from "./webcmd-diagnostic.js";

const config = loadConfig();
const registry = new SkillRegistry(config.skillsDirectory);
await registry.load();
const mockPortal = new MockPortal();
const executor = new SkillExecutor(registry, `http://127.0.0.1:${config.port}`);
const forgeEngine = new ForgeEngine(registry, modelFromEnvironment());
const runManager = new RunManager(executor);
const server = createForgeServer(config, { registry, executor, mockPortal, forgeEngine, runManager });

server.listen(config.port, "0.0.0.0", () => {
  console.log(`Forge listens on port ${config.port}.`);
  console.log(`${registry.list().length} skill${registry.list().length === 1 ? "" : "s"} loaded.`);
  void refreshWebcmdDiagnostic().then((diagnostic) => console.log(diagnostic.status === "ready" ? `Webcmd ${diagnostic.version ?? "unknown"} is ready.` : "Webcmd is degraded. Health remains available."));
});

function shutdown(signal: string): void {
  console.log(`${signal} received. Forge closes cleanly.`);
  server.close((error) => { process.exitCode = error ? 1 : 0; });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
