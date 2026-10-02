export interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  embed(text: string): Promise<number[]>;
  embedBatch?(texts: string[]): Promise<number[][]>;
}

export function assertEmbeddingDimensions(
  embedding: number[],
  expected: number,
  providerName: string
): void {
  if (embedding.length !== expected) {
    throw new Error(
      `Embedding dimension mismatch for provider "${providerName}": expected ${expected}, got ${embedding.length}`
    );
  }
}

export function embeddingToSqlLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
