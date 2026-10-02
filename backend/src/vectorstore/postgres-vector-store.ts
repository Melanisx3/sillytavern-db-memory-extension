import type { Pool } from "pg";
import { embeddingToSqlLiteral } from "../embeddings/provider.js";
import type {
  VectorRecord,
  VectorSearchHit,
  VectorSearchOptions,
  VectorStore,
} from "./vector-store.js";

/**
 * pgvector-backed VectorStore. userId is always applied in search/update/delete.
 */
export class PostgresVectorStore implements VectorStore {
  constructor(private readonly pool: Pool) {}

  async add(record: VectorRecord): Promise<void> {
    const result = await this.pool.query(
      `UPDATE memories
       SET embedding = $1::vector, updated_at = NOW()
       WHERE id = $2 AND user_id = $3`,
      [embeddingToSqlLiteral(record.embedding), record.id, record.userId]
    );

    if (result.rowCount === 0) {
      throw new Error(`Cannot save embedding: memory ${record.id} not found for user`);
    }
  }

  async search(options: VectorSearchOptions): Promise<VectorSearchHit[]> {
    const { queryEmbedding, limit, similarityThreshold = 0, filter } = options;

    if (!filter.userId) {
      throw new Error("VectorStore.search requires filter.userId for isolation");
    }

    const params: unknown[] = [embeddingToSqlLiteral(queryEmbedding), filter.userId];
    const clauses = ["user_id = $2", "embedding IS NOT NULL"];

    if (filter.chatId) {
      params.push(filter.chatId);
      clauses.push(`chat_id = $${params.length}`);
    }

    if (filter.characterId) {
      params.push(filter.characterId);
      clauses.push(`character_id = $${params.length}`);
    }

    if (filter.types && filter.types.length > 0) {
      params.push(filter.types);
      clauses.push(`type = ANY($${params.length}::text[])`);
    }

    if (filter.minImportance !== undefined) {
      params.push(filter.minImportance);
      clauses.push(`importance >= $${params.length}`);
    }

    params.push(similarityThreshold);
    const thresholdIdx = params.length;
    // cosine distance <=> ; similarity = 1 - distance
    clauses.push(`(1 - (embedding <=> $1::vector)) >= $${thresholdIdx}`);

    params.push(limit);
    const limitIdx = params.length;

    const sql = `
      SELECT id, (1 - (embedding <=> $1::vector))::float8 AS similarity
      FROM memories
      WHERE ${clauses.join(" AND ")}
      ORDER BY embedding <=> $1::vector
      LIMIT $${limitIdx}
    `;

    const result = await this.pool.query<{ id: string; similarity: number }>(sql, params);
    return result.rows.map((row) => ({
      id: row.id,
      similarity: Number(row.similarity),
    }));
  }

  async update(id: string, userId: string, embedding: number[]): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE memories
       SET embedding = $1::vector, updated_at = NOW()
       WHERE id = $2 AND user_id = $3`,
      [embeddingToSqlLiteral(embedding), id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async delete(id: string, userId: string): Promise<boolean> {
    // VectorStore.delete clears the embedding; Memory Engine owns row deletion.
    const result = await this.pool.query(
      `UPDATE memories
       SET embedding = NULL, updated_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }
}
