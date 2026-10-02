import type { Pool, QueryResultRow } from "pg";
import type { EmbeddingProvider } from "../embeddings/provider.js";
import { assertEmbeddingDimensions, embeddingToSqlLiteral } from "../embeddings/provider.js";
import type { VectorStore } from "../vectorstore/vector-store.js";
import { buildMemoryContext } from "./context-builder.js";
import {
  decideDeduplication,
  mergeConfidence,
  mergeImportance,
  mergeMemoryContent,
} from "./deduplication.js";
import { extractMemoryCandidates } from "./extraction.js";
import { rankMemories } from "./ranking.js";
import type {
  CreateMemoryInput,
  ListMemoriesFilter,
  Memory,
  MemoryContext,
  MemoryType,
  ProcessMessageInput,
  RankedMemory,
  SemanticSearchOptions,
  UpdateMemoryInput,
} from "./types.js";

const MEMORY_SELECT = `
  id,
  user_id AS "userId",
  chat_id AS "chatId",
  character_id AS "characterId",
  content,
  type,
  importance,
  confidence,
  source_message_id AS "sourceMessageId",
  CASE WHEN embedding IS NULL THEN NULL ELSE embedding::text END AS "embeddingText",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

function parseEmbeddingText(value: string | null | undefined): number[] | null {
  if (!value) {
    return null;
  }
  const trimmed = value.replace(/^\[/, "").replace(/\]$/, "");
  if (!trimmed) {
    return null;
  }
  return trimmed.split(",").map((part) => Number(part.trim()));
}

function mapRow(row: QueryResultRow): Memory {
  return {
    id: row.id,
    userId: row.userId,
    chatId: row.chatId,
    characterId: row.characterId,
    content: row.content,
    type: row.type,
    importance: Number(row.importance),
    confidence: Number(row.confidence),
    sourceMessageId: row.sourceMessageId,
    embedding: parseEmbeddingText(row.embeddingText),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class MemoryEngine {
  constructor(
    private readonly pool: Pool,
    private readonly embeddings: EmbeddingProvider,
    private readonly vectorStore: VectorStore
  ) {}

  get embeddingDimensions(): number {
    return this.embeddings.dimensions;
  }

  get embeddingProviderName(): string {
    return this.embeddings.name;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const embedding = await this.embeddings.embed(text);
    assertEmbeddingDimensions(embedding, this.embeddings.dimensions, this.embeddings.name);
    return embedding;
  }

  async saveEmbedding(memoryId: string, userId: string, embedding?: number[]): Promise<Memory> {
    const memory = await this.getMemory(memoryId, userId);
    if (!memory) {
      throw new Error("Memory not found");
    }

    const vector = embedding ?? (await this.generateEmbedding(memory.content));
    assertEmbeddingDimensions(vector, this.embeddings.dimensions, this.embeddings.name);
    await this.vectorStore.add({ id: memoryId, userId, embedding: vector });

    const updated = await this.getMemory(memoryId, userId);
    if (!updated) {
      throw new Error("Memory not found after embedding save");
    }
    return updated;
  }

  async createMemory(input: CreateMemoryInput): Promise<{ memory: Memory; deduplicated: boolean }> {
    const content = input.content.trim();
    if (!content) {
      throw new Error("Memory content is required");
    }

    const type = input.type ?? "fact";
    const importance = clamp01(input.importance ?? 0.5);
    const confidence = clamp01(input.confidence ?? 0.5);
    const embedding = input.embedding ?? (await this.generateEmbedding(content));
    assertEmbeddingDimensions(embedding, this.embeddings.dimensions, this.embeddings.name);

    if (!input.forceCreate) {
      const similar = await this.findNearDuplicates(input.userId, embedding, {
        chatId: input.chatId,
        characterId: input.characterId,
      });

      const decision = decideDeduplication(content, embedding, similar);
      if (decision.action === "update" && decision.existing) {
        const merged = await this.updateMemory(decision.existing.id, input.userId, {
          content: mergeMemoryContent(decision.existing.content, content),
          type,
          importance: mergeImportance(decision.existing.importance, importance, decision.similarity),
          confidence: mergeConfidence(decision.existing.confidence, confidence),
          chatId: input.chatId !== undefined ? input.chatId : decision.existing.chatId,
          characterId:
            input.characterId !== undefined ? input.characterId : decision.existing.characterId,
          sourceMessageId:
            input.sourceMessageId !== undefined
              ? input.sourceMessageId
              : decision.existing.sourceMessageId,
          embedding,
          reembed: false,
        });
        return { memory: merged, deduplicated: true };
      }
    }

    const result = await this.pool.query(
      `INSERT INTO memories (
         user_id, chat_id, character_id, content, type, importance, confidence,
         source_message_id, embedding
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::vector)
       RETURNING ${MEMORY_SELECT}`,
      [
        input.userId,
        input.chatId ?? null,
        input.characterId ?? null,
        content,
        type,
        importance,
        confidence,
        input.sourceMessageId ?? null,
        embeddingToSqlLiteral(embedding),
      ]
    );

    return { memory: mapRow(result.rows[0]), deduplicated: false };
  }

  async updateMemory(id: string, userId: string, input: UpdateMemoryInput): Promise<Memory> {
    const existing = await this.getMemory(id, userId);
    if (!existing) {
      throw new Error("Memory not found");
    }

    const content = input.content?.trim() ?? existing.content;
    const type = input.type ?? existing.type;
    const importance = clamp01(input.importance ?? existing.importance);
    const confidence = clamp01(input.confidence ?? existing.confidence);
    const chatId = input.chatId !== undefined ? input.chatId : existing.chatId;
    const characterId = input.characterId !== undefined ? input.characterId : existing.characterId;
    const sourceMessageId =
      input.sourceMessageId !== undefined ? input.sourceMessageId : existing.sourceMessageId;

    const shouldReembed = input.reembed !== false && (input.content !== undefined || input.embedding);
    const embedding =
      input.embedding ??
      (shouldReembed && input.content !== undefined
        ? await this.generateEmbedding(content)
        : existing.embedding);

    if (embedding) {
      assertEmbeddingDimensions(embedding, this.embeddings.dimensions, this.embeddings.name);
    }

    const result = await this.pool.query(
      `UPDATE memories SET
         content = $1,
         type = $2,
         importance = $3,
         confidence = $4,
         chat_id = $5,
         character_id = $6,
         source_message_id = $7,
         embedding = COALESCE($8::vector, embedding),
         updated_at = NOW()
       WHERE id = $9 AND user_id = $10
       RETURNING ${MEMORY_SELECT}`,
      [
        content,
        type,
        importance,
        confidence,
        chatId,
        characterId,
        sourceMessageId,
        embedding ? embeddingToSqlLiteral(embedding) : null,
        id,
        userId,
      ]
    );

    if (!result.rows[0]) {
      throw new Error("Memory not found");
    }

    return mapRow(result.rows[0]);
  }

  async deleteMemory(id: string, userId: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM memories WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async getMemory(id: string, userId: string): Promise<Memory | null> {
    const result = await this.pool.query(
      `SELECT ${MEMORY_SELECT} FROM memories WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async listMemories(filter: ListMemoriesFilter): Promise<Memory[]> {
    const params: unknown[] = [filter.userId];
    const clauses = ["user_id = $1"];

    if (filter.chatId) {
      params.push(filter.chatId);
      clauses.push(`chat_id = $${params.length}`);
    }
    if (filter.characterId) {
      params.push(filter.characterId);
      clauses.push(`character_id = $${params.length}`);
    }
    if (filter.type) {
      const types = Array.isArray(filter.type) ? filter.type : [filter.type];
      params.push(types);
      clauses.push(`type = ANY($${params.length}::text[])`);
    }
    if (filter.minImportance !== undefined) {
      params.push(filter.minImportance);
      clauses.push(`importance >= $${params.length}`);
    }

    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;
    params.push(limit, offset);

    const result = await this.pool.query(
      `SELECT ${MEMORY_SELECT}
       FROM memories
       WHERE ${clauses.join(" AND ")}
       ORDER BY importance DESC, updated_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return result.rows.map(mapRow);
  }

  async semanticSearch(options: SemanticSearchOptions): Promise<RankedMemory[]> {
    if (!options.userId) {
      throw new Error("semanticSearch requires userId");
    }

    const queryEmbedding = await this.generateEmbedding(options.query);
    const limit = options.limit ?? 10;
    const similarityThreshold = options.similarityThreshold ?? 0.2;

    const hits = await this.vectorStore.search({
      queryEmbedding,
      limit: Math.max(limit * 3, limit),
      similarityThreshold,
      filter: {
        userId: options.userId,
        chatId: options.chatId,
        characterId: options.characterId,
        types: options.types,
        minImportance: options.minImportance,
      },
    });

    if (hits.length === 0) {
      return [];
    }

    const ids = hits.map((hit) => hit.id);
    const result = await this.pool.query(
      `SELECT ${MEMORY_SELECT} FROM memories WHERE user_id = $1 AND id = ANY($2::uuid[])`,
      [options.userId, ids]
    );

    const byId = new Map(result.rows.map((row) => [row.id as string, mapRow(row)]));
    const withSimilarity = hits
      .map((hit) => {
        const memory = byId.get(hit.id);
        if (!memory) {
          return null;
        }
        // Defense in depth: never leak another user's memory.
        if (memory.userId !== options.userId) {
          return null;
        }
        return { ...memory, similarity: hit.similarity };
      })
      .filter((item): item is Memory & { similarity: number } => item !== null);

    return this.rankMemories(withSimilarity, {
      similarityWeight: options.similarityWeight,
      importanceWeight: options.importanceWeight,
    }).slice(0, limit);
  }

  rankMemories(
    items: Array<Memory & { similarity: number }>,
    options?: { similarityWeight?: number; importanceWeight?: number; confidenceWeight?: number }
  ): RankedMemory[] {
    return rankMemories(items, options);
  }

  async buildContext(options: SemanticSearchOptions & { minRankScore?: number; maxEntries?: number }): Promise<MemoryContext> {
    const ranked = await this.semanticSearch(options);
    return buildMemoryContext({
      query: options.query,
      memories: ranked,
      minRankScore: options.minRankScore,
      maxEntries: options.maxEntries ?? options.limit,
    });
  }

  /** Alias matching the required API name. */
  async buildMemoryContext(
    options: SemanticSearchOptions & { minRankScore?: number; maxEntries?: number }
  ): Promise<MemoryContext> {
    return this.buildContext(options);
  }

  /**
   * Full pipeline: Message → Preprocess → Extract → Classify → Score → Embed → Store (with dedupe).
   */
  async processMessage(input: ProcessMessageInput): Promise<{
    created: Memory[];
    updated: Memory[];
    candidates: number;
  }> {
    const candidates = extractMemoryCandidates(input.content, input.role);
    const created: Memory[] = [];
    const updated: Memory[] = [];

    for (const candidate of candidates) {
      const result = await this.createMemory({
        userId: input.userId,
        chatId: input.chatId,
        characterId: input.characterId,
        sourceMessageId: input.sourceMessageId,
        content: candidate.content,
        type: candidate.type,
        importance: candidate.importance,
        confidence: candidate.confidence,
      });

      if (result.deduplicated) {
        updated.push(result.memory);
      } else {
        created.push(result.memory);
      }
    }

    return { created, updated, candidates: candidates.length };
  }

  private async findNearDuplicates(
    userId: string,
    embedding: number[],
    scope: { chatId?: string | null; characterId?: string | null }
  ): Promise<Array<Memory & { similarity: number }>> {
    const hits = await this.vectorStore.search({
      queryEmbedding: embedding,
      limit: 5,
      similarityThreshold: 0.8,
      filter: {
        userId,
        chatId: scope.chatId ?? undefined,
        characterId: scope.characterId ?? undefined,
      },
    });

    if (hits.length === 0) {
      return [];
    }

    const result = await this.pool.query(
      `SELECT ${MEMORY_SELECT} FROM memories WHERE user_id = $1 AND id = ANY($2::uuid[])`,
      [userId, hits.map((hit) => hit.id)]
    );

    const byId = new Map(result.rows.map((row) => [row.id as string, mapRow(row)]));
    return hits
      .map((hit) => {
        const memory = byId.get(hit.id);
        return memory ? { ...memory, similarity: hit.similarity } : null;
      })
      .filter((item): item is Memory & { similarity: number } => item !== null);
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export type { MemoryType };
