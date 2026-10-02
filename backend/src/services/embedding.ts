import { createHash } from "node:crypto";
import type { EmbeddingProvider } from "../embeddings/provider.js";
import { LocalHashEmbeddingProvider } from "../embeddings/local-hash-provider.js";
import { config } from "../config.js";

/** @deprecated Use EmbeddingProvider via MemoryEngine.generateEmbedding */
export function embedText(text: string): number[] {
  const provider: EmbeddingProvider = new LocalHashEmbeddingProvider(config.embedding.dimensions);
  // sync path for legacy callers — local provider is sync under the hood via deasync-less compute
  const dims = provider.dimensions;
  const vector = new Float64Array(dims);
  const normalized = text.toLowerCase().normalize("NFKC").trim();
  if (!normalized) {
    return Array.from(vector);
  }
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const grams: string[] = [...tokens];
  for (let n = 2; n <= 3; n += 1) {
    for (let i = 0; i <= normalized.length - n; i += 1) {
      grams.push(normalized.slice(i, i + n));
    }
  }
  for (const gram of grams) {
    const hash = createHash("sha256").update(gram).digest();
    for (let i = 0; i < 8; i += 1) {
      const index = hash.readUInt16BE(i * 2) % dims;
      const sign = hash[16 + i]! % 2 === 0 ? 1 : -1;
      vector[index]! += sign;
    }
  }
  let norm = 0;
  for (const value of vector) {
    norm += value * value;
  }
  norm = Math.sqrt(norm) || 1;
  return Array.from(vector, (value) => value / norm);
}

export { embeddingToSqlLiteral as embeddingToSql } from "../embeddings/provider.js";
