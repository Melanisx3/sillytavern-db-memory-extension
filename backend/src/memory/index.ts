import { LocalHashEmbeddingProvider } from "../embeddings/local-hash-provider.js";
import type { EmbeddingProvider } from "../embeddings/provider.js";
import { pool } from "../db.js";
import { config } from "../config.js";
import { PostgresVectorStore } from "../vectorstore/postgres-vector-store.js";
import { MemoryEngine } from "./engine.js";

let engine: MemoryEngine | null = null;

export function createEmbeddingProvider(): EmbeddingProvider {
  const provider = config.embedding.provider;

  switch (provider) {
    case "local-hash":
      return new LocalHashEmbeddingProvider(config.embedding.dimensions);
    default:
      throw new Error(`Unsupported embedding provider: ${provider}`);
  }
}

export function getMemoryEngine(): MemoryEngine {
  if (!engine) {
    const embeddings = createEmbeddingProvider();
    const vectorStore = new PostgresVectorStore(pool);
    engine = new MemoryEngine(pool, embeddings, vectorStore);
  }
  return engine;
}

export function resetMemoryEngineForTests(): void {
  engine = null;
}
