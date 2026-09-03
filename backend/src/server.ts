import { loadConfig } from "./config.js";
import { SkillExecutor } from "./executor.js";
import { createTHRUServer } from "./app.js";
import { MockPortal } from "./mock-portal.js";
import { THRUEngine } from "./forge-engine.js";
import { modelFromEnvironment } from "./forge-model.js";
import { RunManager } from "./run-manager.js";
import { SkillRegistry } from "./registry.js";
import { refreshWebcmdDiagnostic } from "./webcmd-diagnostic.js";
import { ApiKeyStore } from "./key-store.js";
import { TeachingSessionStore } from "./teaching-sessions.js";
import { initializeDatabase, syncSkillCatalog } from "./database.js";
import { SessionStore } from "./session-store.js";
import { ApprovalStore } from "./approval-store.js";

const config = loadConfig();
const database = await initializeDatabase(config.databaseUrl);
const registry = new SkillRegistry(config.skillsDirectory, database);
await registry.load();
await syncSkillCatalog(database, registry.list());
registry.on("change", (id: string) => { const skill = registry.get(id); if (skill) void syncSkillCatalog(database, [skill]).catch((error) => console.error("Unable to persist changed skill catalog entry.", error)); });
const mockPortal = new MockPortal();
const executor = new SkillExecutor(registry, `http://127.0.0.1:${config.port}`);
const forgeEngine = new THRUEngine(registry, modelFromEnvironment());
const runManager = new RunManager(executor, config.runsFile, config.runRetentionDays, database, config.queueMaxDepth);
await runManager.ready();
const apiKeys = new ApiKeyStore(config.keysFile, database);
await apiKeys.ready();
const sessions = new SessionStore(config.sessionsFile, database);
await sessions.ready();
const approvals = new ApprovalStore(config.approvalsFile, database);
await approvals.ready();
const teaching = new TeachingSessionStore(forgeEngine, 15 * 60_000, config.teachingFile, executor, database);
await teaching.ready();
const server = createTHRUServer(config, { registry, executor, mockPortal, forgeEngine, runManager, apiKeys, sessions, teaching, approvals, database });

server.listen(config.port, "0.0.0.0", () => {
  console.log(`THRU listens on port ${config.port}.`);
  console.log(`${registry.list().length} skill${registry.list().length === 1 ? "" : "s"} loaded.`);
  console.log(`Database ${database.status}.`);
  void refreshWebcmdDiagnostic().then((diagnostic) => console.log(diagnostic.status === "ready" ? `Webcmd ${diagnostic.version ?? "unknown"} is ready.` : "Webcmd is degraded. Health remains available."));
});

function shutdown(signal: string): void {
  console.log(`${signal} received. THRU closes cleanly.`);
  server.close((error) => { void database.close().finally(() => { process.exitCode = error ? 1 : 0; }); });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
