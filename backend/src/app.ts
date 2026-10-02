import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { authRouter } from "./routes/auth.js";
import { chatsRouter } from "./routes/chats.js";
import { contextRouter } from "./routes/context.js";
import { embeddingsRouter } from "./routes/embeddings.js";
import { memoriesRouter } from "./routes/memories.js";
import { messagesRouter } from "./routes/messages.js";
import { searchRouter } from "./routes/search.js";
import { pool } from "./db.js";
import { getMemoryEngine } from "./memory/index.js";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", async (_req, res) => {
    try {
      await pool.query("SELECT 1");
      const extension = await pool.query(
        "SELECT extname, extversion FROM pg_extension WHERE extname = 'vector'"
      );
      const engine = getMemoryEngine();
      res.json({
        status: "ok",
        postgres: true,
        pgvector: Boolean(extension.rows[0]),
        pgvectorVersion: extension.rows[0]?.extversion ?? null,
        embeddingProvider: engine.embeddingProviderName,
        embeddingDimensions: engine.embeddingDimensions,
      });
    } catch (error) {
      res.status(503).json({
        status: "error",
        postgres: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.use("/api/auth", authRouter);
  app.use("/api/chats", chatsRouter);
  app.use("/api/messages", messagesRouter);
  app.use("/api/memories", memoriesRouter);
  app.use("/api/embeddings", embeddingsRouter);
  app.use("/api/search", searchRouter);
  app.use("/api/context", contextRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(error);
    res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  });

  return app;
}
