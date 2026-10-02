import { createHash } from "node:crypto";
import {
  assertEmbeddingDimensions,
  type EmbeddingProvider,
} from "./provider.js";

/**
 * Deterministic local embedding via hashed character n-grams.
 * Dimensions come from configuration — never hardcoded by callers.
 */
export class LocalHashEmbeddingProvider implements EmbeddingProvider {
  readonly name = "local-hash-ngram-v1";

  constructor(readonly dimensions: number) {
    if (!Number.isInteger(dimensions) || dimensions < 8) {
      throw new Error(`Invalid embedding dimensions: ${dimensions}`);
    }
  }

  async embed(text: string): Promise<number[]> {
    const embedding = this.compute(text);
    assertEmbeddingDimensions(embedding, this.dimensions, this.name);
    return embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((text) => this.embed(text)));
  }

  private compute(text: string): number[] {
    const dims = this.dimensions;
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
}
