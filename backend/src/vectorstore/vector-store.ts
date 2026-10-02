export interface VectorRecord {
  id: string;
  userId: string;
  embedding: number[];
  /** Opaque metadata used only for filtering inside the store implementation. */
  metadata?: Record<string, unknown>;
}

export interface VectorSearchFilter {
  /** REQUIRED for private memory isolation. */
  userId: string;
  chatId?: string | null;
  characterId?: string | null;
  types?: string[];
  minImportance?: number;
}

export interface VectorSearchOptions {
  queryEmbedding: number[];
  limit: number;
  /** Cosine similarity threshold in [0, 1]. */
  similarityThreshold?: number;
  filter: VectorSearchFilter;
}

export interface VectorSearchHit {
  id: string;
  similarity: number;
}

export interface VectorStore {
  add(record: VectorRecord): Promise<void>;
  search(options: VectorSearchOptions): Promise<VectorSearchHit[]>;
  update(id: string, userId: string, embedding: number[]): Promise<boolean>;
  delete(id: string, userId: string): Promise<boolean>;
}
