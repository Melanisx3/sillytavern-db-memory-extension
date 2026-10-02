import { cosineSimilarity } from "../embeddings/provider.js";
import type { Memory } from "./types.js";

export interface DedupDecision {
  action: "create" | "update";
  existing?: Memory;
  similarity: number;
  reason: string;
}

export interface DedupOptions {
  /** Exact/near-duplicate threshold (cosine). Default 0.92 */
  duplicateThreshold?: number;
  /** Near-duplicate merge threshold. Default 0.84 */
  nearDuplicateThreshold?: number;
}

/**
 * Decide whether to create a new memory or update an existing near-duplicate.
 * Never deletes a useful memory solely because of high similarity.
 */
export function decideDeduplication(
  candidateContent: string,
  candidateEmbedding: number[],
  existing: Array<Memory & { similarity?: number }>,
  options: DedupOptions = {}
): DedupDecision {
  const duplicateThreshold = options.duplicateThreshold ?? 0.92;
  const nearDuplicateThreshold = options.nearDuplicateThreshold ?? 0.84;

  if (existing.length === 0) {
    return { action: "create", similarity: 0, reason: "no_candidates" };
  }

  let best: { memory: Memory; similarity: number } | null = null;

  for (const memory of existing) {
    let similarity = memory.similarity ?? 0;
    if (memory.embedding && memory.embedding.length === candidateEmbedding.length) {
      similarity = Math.max(similarity, cosineSimilarity(candidateEmbedding, memory.embedding));
    }

    // Exact text match (case-insensitive) always counts as duplicate.
    if (memory.content.trim().toLowerCase() === candidateContent.trim().toLowerCase()) {
      similarity = Math.max(similarity, 1);
    }

    if (!best || similarity > best.similarity) {
      best = { memory, similarity };
    }
  }

  if (!best) {
    return { action: "create", similarity: 0, reason: "no_candidates" };
  }

  if (best.similarity >= duplicateThreshold) {
    return {
      action: "update",
      existing: best.memory,
      similarity: best.similarity,
      reason: "duplicate",
    };
  }

  if (best.similarity >= nearDuplicateThreshold) {
    return {
      action: "update",
      existing: best.memory,
      similarity: best.similarity,
      reason: "near_duplicate",
    };
  }

  return {
    action: "create",
    similarity: best.similarity,
    reason: "distinct",
  };
}

/**
 * Merge candidate into existing memory without discarding useful detail.
 */
export function mergeMemoryContent(existingContent: string, incomingContent: string): string {
  const a = existingContent.trim();
  const b = incomingContent.trim();

  if (a.toLowerCase() === b.toLowerCase()) {
    return a.length >= b.length ? a : b;
  }

  if (a.toLowerCase().includes(b.toLowerCase())) {
    return a;
  }
  if (b.toLowerCase().includes(a.toLowerCase())) {
    return b;
  }

  // Prefer the longer, more informative statement; append unique clause if short.
  if (b.length > a.length * 1.15) {
    return b;
  }
  if (a.length > b.length * 1.15) {
    return a;
  }

  return `${a} | ${b}`;
}

export function mergeImportance(existing: number, incoming: number, similarity: number): number {
  // Keep the stronger signal; slight bump when confirmed by near-duplicate evidence.
  const confirmed = Math.max(existing, incoming) + (similarity >= 0.92 ? 0.05 : 0.02);
  return Math.min(1, confirmed);
}

export function mergeConfidence(existing: number, incoming: number): number {
  return Math.min(1, Math.max(existing, incoming) + 0.03);
}
