export type MemoryType =
  | "fact"
  | "preference"
  | "event"
  | "relationship"
  | "character_state"
  | "world_information"
  | "important_event";

export const MEMORY_TYPES: readonly MemoryType[] = [
  "fact",
  "preference",
  "event",
  "relationship",
  "character_state",
  "world_information",
  "important_event",
] as const;

export interface Memory {
  id: string;
  userId: string;
  chatId: string | null;
  characterId: string | null;
  content: string;
  type: MemoryType;
  importance: number;
  confidence: number;
  sourceMessageId: string | null;
  embedding: number[] | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMemoryInput {
  userId: string;
  content: string;
  chatId?: string | null;
  characterId?: string | null;
  type?: MemoryType;
  importance?: number;
  confidence?: number;
  sourceMessageId?: string | null;
  embedding?: number[] | null;
  /** When true, skip near-duplicate merge and always insert. */
  forceCreate?: boolean;
}

export interface UpdateMemoryInput {
  content?: string;
  chatId?: string | null;
  characterId?: string | null;
  type?: MemoryType;
  importance?: number;
  confidence?: number;
  sourceMessageId?: string | null;
  embedding?: number[] | null;
  reembed?: boolean;
}

export interface ListMemoriesFilter {
  userId: string;
  chatId?: string;
  characterId?: string;
  type?: MemoryType | MemoryType[];
  minImportance?: number;
  limit?: number;
  offset?: number;
}

export interface SemanticSearchOptions {
  userId: string;
  query: string;
  limit?: number;
  similarityThreshold?: number;
  chatId?: string;
  characterId?: string;
  types?: MemoryType[];
  minImportance?: number;
  /** Weight for cosine similarity in final rank (0..1 complementary with importance). */
  similarityWeight?: number;
  importanceWeight?: number;
}

export interface RankedMemory extends Memory {
  similarity: number;
  rankScore: number;
}

export interface ContextEntry {
  memory: string;
  type: MemoryType;
  importance: number;
  relevance: number;
  source: {
    memoryId: string;
    chatId: string | null;
    characterId: string | null;
    sourceMessageId: string | null;
  };
}

export interface MemoryContext {
  query: string;
  entries: ContextEntry[];
  contextText: string;
}

export interface ExtractedCandidate {
  content: string;
  type: MemoryType;
  importance: number;
  confidence: number;
}

export interface ProcessMessageInput {
  userId: string;
  chatId?: string | null;
  characterId?: string | null;
  sourceMessageId?: string | null;
  role: "user" | "assistant" | "system";
  content: string;
}
