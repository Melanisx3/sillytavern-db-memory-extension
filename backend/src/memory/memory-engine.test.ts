import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyMemory } from "./classification.js";
import { buildMemoryContext } from "./context-builder.js";
import {
  decideDeduplication,
  mergeMemoryContent,
  mergeImportance,
} from "./deduplication.js";
import { extractMemoryCandidates } from "./extraction.js";
import { preprocessText, segmentCandidates } from "./preprocessing.js";
import { rankMemories } from "./ranking.js";
import type { Memory, RankedMemory } from "./types.js";
import { LocalHashEmbeddingProvider } from "../embeddings/local-hash-provider.js";
import { cosineSimilarity } from "../embeddings/provider.js";

function makeMemory(partial: Partial<Memory> & Pick<Memory, "id" | "content">): Memory {
  return {
    userId: "user-1",
    chatId: null,
    characterId: null,
    type: "fact",
    importance: 0.5,
    confidence: 0.5,
    sourceMessageId: null,
    embedding: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}

describe("preprocessing", () => {
  it("normalizes whitespace", () => {
    assert.equal(preprocessText("  hello   world \n\n\n ok "), "hello world\n\nok");
  });

  it("segments sentences", () => {
    const parts = segmentCandidates("Alice likes tea. Bob owns a sword.");
    assert.equal(parts.length, 2);
  });
});

describe("classification", () => {
  it("detects preference", () => {
    assert.equal(classifyMemory("Alice likes green tea.").type, "preference");
  });

  it("detects important_event", () => {
    assert.equal(classifyMemory("The king was killed in the war.").type, "important_event");
  });

  it("detects relationship", () => {
    assert.equal(classifyMemory("Bob is Alice's brother and closest friend.").type, "relationship");
  });
});

describe("extraction", () => {
  it("extracts candidates with scores", () => {
    const candidates = extractMemoryCandidates(
      "Alice likes green tea. She is Bob's sister.",
      "user"
    );
    assert.ok(candidates.length >= 1);
    assert.ok(candidates.every((c) => c.importance >= 0 && c.confidence <= 1));
  });

  it("ignores pure noise", () => {
    assert.deepEqual(extractMemoryCandidates("ok", "user"), []);
  });
});

describe("ranking", () => {
  it("weights similarity and importance", () => {
    const ranked = rankMemories([
      { ...makeMemory({ id: "a", content: "low", importance: 0.9, confidence: 0.5 }), similarity: 0.2 },
      { ...makeMemory({ id: "b", content: "high", importance: 0.3, confidence: 0.5 }), similarity: 0.95 },
    ]);

    assert.equal(ranked[0]!.id, "b");
    assert.ok(ranked[0]!.rankScore > ranked[1]!.rankScore);
  });
});

describe("deduplication", () => {
  it("updates exact duplicates instead of creating", () => {
    const embedding = [1, 0, 0];
    const existing = makeMemory({
      id: "m1",
      content: "Alice likes tea",
      embedding: [1, 0, 0],
      importance: 0.4,
    });

    const decision = decideDeduplication("Alice likes tea", embedding, [
      { ...existing, similarity: 1 },
    ]);

    assert.equal(decision.action, "update");
    assert.equal(decision.reason, "duplicate");
  });

  it("creates when similarity is low", () => {
    const decision = decideDeduplication(
      "Completely different topic about dragons",
      [0, 1, 0],
      [{ ...makeMemory({ id: "m1", content: "Alice likes tea", embedding: [1, 0, 0] }), similarity: 0.1 }]
    );
    assert.equal(decision.action, "create");
  });

  it("merges content without deleting useful detail", () => {
    const merged = mergeMemoryContent("Alice likes tea", "Alice likes green tea ceremonies");
    assert.match(merged, /green tea/i);
    assert.ok(mergeImportance(0.4, 0.7, 0.95) >= 0.7);
  });
});

describe("context builder", () => {
  it("builds structured context and drops low rank", () => {
    const memories: RankedMemory[] = [
      {
        ...makeMemory({ id: "1", content: "Alice likes tea", type: "preference", importance: 0.8 }),
        similarity: 0.9,
        rankScore: 0.8,
      },
      {
        ...makeMemory({ id: "2", content: "noise", importance: 0.1 }),
        similarity: 0.1,
        rankScore: 0.1,
      },
    ];

    const context = buildMemoryContext({ query: "tea", memories, minRankScore: 0.35 });
    assert.equal(context.entries.length, 1);
    assert.equal(context.entries[0]!.type, "preference");
    assert.ok(context.entries[0]!.source.memoryId);
    assert.match(context.contextText, /Alice likes tea/);
  });
});

describe("embedding provider", () => {
  it("uses configured dimensions", async () => {
    const provider = new LocalHashEmbeddingProvider(64);
    const embedding = await provider.embed("hello memory engine");
    assert.equal(embedding.length, 64);
    assert.equal(provider.dimensions, 64);
  });

  it("is deterministic and cosine-similar for related text", async () => {
    const provider = new LocalHashEmbeddingProvider(128);
    const a = await provider.embed("Alice likes green tea");
    const b = await provider.embed("Alice likes green tea");
    const c = await provider.embed("quantum chassis calibration");
    assert.ok(Math.abs(cosineSimilarity(a, b) - 1) < 1e-9);
    assert.ok(cosineSimilarity(a, c) < cosineSimilarity(a, b));
  });
});
