import { loadConfig } from "./config.js";
import { createForgeServer } from "./app.js";
import { refreshWebcmdDiagnostic } from "./webcmd-diagnostic.js";

const config = loadConfig();
const server = createForgeServer(config);

server.listen(config.port, "0.0.0.0", () => {
  console.log(`Forge listens on port ${config.port}.`);
  void refreshWebcmdDiagnostic().then((diagnostic) => {
    console.log(
      diagnostic.status === "ready"
        ? `Webcmd ${diagnostic.version ?? "unknown"} is ready.`
        : "Webcmd is degraded. Health remains available.",
    );
  });
});

function shutdown(signal: string): void {
  console.log(`${signal} received. Forge closes cleanly.`);
  server.close((error) => {
    process.exitCode = error ? 1 : 0;
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

