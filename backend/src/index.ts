import { createApp } from "./app.js";
import { config } from "./config.js";
import { pool, verifyDatabase } from "./db.js";

async function main(): Promise<void> {
  await verifyDatabase();

  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`Backend listening on port ${config.port} (${config.nodeEnv})`);
  });

  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, shutting down...`);
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error: unknown) => {
  console.error("Backend startup failed:", error);
  process.exit(1);
});
