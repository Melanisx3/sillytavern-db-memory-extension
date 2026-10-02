import type { Memory, RankedMemory } from "./types.js";

export interface RankOptions {
  similarityWeight?: number;
  importanceWeight?: number;
  confidenceWeight?: number;
}

/**
 * Rank memories by weighted combination of similarity, importance, and confidence.
 */
export function rankMemories(
  items: Array<Memory & { similarity: number }>,
  options: RankOptions = {}
): RankedMemory[] {
  const similarityWeight = options.similarityWeight ?? 0.55;
  const importanceWeight = options.importanceWeight ?? 0.3;
  const confidenceWeight = options.confidenceWeight ?? 0.15;
  const total = similarityWeight + importanceWeight + confidenceWeight || 1;

  const ranked = items.map((item) => {
    const rankScore =
      (item.similarity * similarityWeight +
        item.importance * importanceWeight +
        item.confidence * confidenceWeight) /
      total;

    return {
      ...item,
      rankScore,
    };
  });

  ranked.sort((a, b) => b.rankScore - a.rankScore || b.similarity - a.similarity);
  return ranked;
}
