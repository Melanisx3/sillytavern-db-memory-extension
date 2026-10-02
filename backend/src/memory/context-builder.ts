import type { ContextEntry, MemoryContext, RankedMemory } from "./types.js";

export interface BuildContextOptions {
  query: string;
  memories: RankedMemory[];
  /** Drop entries below this rankScore. Default 0.35 */
  minRankScore?: number;
  /** Max entries in context. Default 8 */
  maxEntries?: number;
}

/**
 * Build a compact structured memory context for LLM prompts.
 */
export function buildMemoryContext(options: BuildContextOptions): MemoryContext {
  const minRankScore = options.minRankScore ?? 0.35;
  const maxEntries = options.maxEntries ?? 8;

  const filtered = options.memories
    .filter((memory) => memory.rankScore >= minRankScore)
    .slice(0, maxEntries);

  const entries: ContextEntry[] = filtered.map((memory) => ({
    memory: memory.content,
    type: memory.type,
    importance: memory.importance,
    relevance: Number(memory.similarity.toFixed(4)),
    source: {
      memoryId: memory.id,
      chatId: memory.chatId,
      characterId: memory.characterId,
      sourceMessageId: memory.sourceMessageId,
    },
  }));

  const lines = entries.map(
    (entry, index) =>
      `[${index + 1}] (${entry.type}, importance=${entry.importance.toFixed(2)}, relevance=${entry.relevance.toFixed(2)}) ${entry.memory}`
  );

  const contextText = lines.length
    ? `Relevant long-term memories for "${options.query}":\n${lines.join("\n")}`
    : "";

  return {
    query: options.query,
    entries,
    contextText,
  };
}
