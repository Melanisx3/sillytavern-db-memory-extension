/**
 * End-to-end API verification for the Memory Engine checklist.
 * Usage: BACKEND_URL=http://localhost:3000 npx tsx scripts/verify-api.ts
 */

const BASE_URL = process.env.BACKEND_URL ?? "http://localhost:3000";

type Json = Record<string, unknown>;

class VerifyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VerifyError";
  }
}

async function request(
  method: string,
  path: string,
  options: { token?: string; body?: unknown; expectStatus?: number | number[] } = {}
): Promise<{ status: number; data: Json | null; raw: string }> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const raw = await response.text();
  let data: Json | null = null;
  if (raw) {
    try {
      data = JSON.parse(raw) as Json;
    } catch {
      data = { raw };
    }
  }

  const expected = options.expectStatus;
  if (expected !== undefined) {
    const allowed = Array.isArray(expected) ? expected : [expected];
    if (!allowed.includes(response.status)) {
      throw new VerifyError(
        `${method} ${path} expected ${allowed.join("|")}, got ${response.status}: ${raw}`
      );
    }
  }

  return { status: response.status, data, raw };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new VerifyError(message);
  }
}

async function main(): Promise<void> {
  const results: Array<{ step: string; ok: boolean; detail?: string }> = [];

  const step = async (name: string, fn: () => Promise<string | void>) => {
    try {
      const detail = await fn();
      results.push({ step: name, ok: true, detail: detail || undefined });
      console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      results.push({ step: name, ok: false, detail });
      console.error(`FAIL  ${name} — ${detail}`);
    }
  };

  let tokenA = "";
  let tokenB = "";
  let chatId = "";
  let messageId = "";
  let memoryId = "";
  const suffix = Date.now().toString(36);

  await step("health / postgres / pgvector", async () => {
    const { data } = await request("GET", "/health", { expectStatus: 200 });
    assert(data?.postgres === true, "postgres not healthy");
    assert(data?.pgvector === true, "pgvector missing");
    assert(typeof data?.embeddingDimensions === "number", "embedding dims missing");
    return `dims=${data?.embeddingDimensions}`;
  });

  await step("registration + login", async () => {
    const reg = await request("POST", "/api/auth/register", {
      body: { username: `alice_${suffix}`, password: "secret123" },
      expectStatus: 201,
    });
    tokenA = String(reg.data?.token ?? "");
    assert(tokenA, "missing token");

    const login = await request("POST", "/api/auth/login", {
      body: { username: `alice_${suffix}`, password: "secret123" },
      expectStatus: 200,
    });
    tokenA = String(login.data?.token ?? tokenA);
  });

  await step("chat + message CRUD", async () => {
    const chat = await request("POST", "/api/chats", {
      token: tokenA,
      body: { title: "Memory Engine Chat" },
      expectStatus: 201,
    });
    chatId = String((chat.data?.chat as Json)?.id ?? "");
    assert(chatId, "chat id missing");

    const msg = await request("POST", "/api/messages", {
      token: tokenA,
      body: {
        chatId,
        role: "user",
        content: "Alice likes green tea and collecting dragon figurines.",
      },
      expectStatus: 201,
    });
    messageId = String((msg.data?.message as Json)?.id ?? "");
    assert(messageId, "message id missing");
  });

  await step("memory CRUD", async () => {
    const created = await request("POST", "/api/memories", {
      token: tokenA,
      body: {
        chatId,
        characterId: "char-alice",
        content: "Alice likes green tea and collecting dragon figurines.",
        type: "preference",
        importance: 0.8,
        confidence: 0.9,
        sourceMessageId: messageId,
        forceCreate: true,
      },
      expectStatus: 201,
    });
    memoryId = String((created.data?.memory as Json)?.id ?? "");
    assert(memoryId, "memory id missing");
    assert((created.data?.memory as Json)?.hasEmbedding === true, "embedding missing");
    assert((created.data?.memory as Json)?.type === "preference", "type mismatch");

    await request("GET", `/api/memories/${memoryId}`, { token: tokenA, expectStatus: 200 });
    await request("PATCH", `/api/memories/${memoryId}`, {
      token: tokenA,
      body: { content: "Alice loves green tea ceremonies and dragon figurines.", importance: 0.85 },
      expectStatus: 200,
    });
    const list = await request("GET", `/api/memories?type=preference&characterId=char-alice`, {
      token: tokenA,
      expectStatus: 200,
    });
    assert(Array.isArray(list.data?.memories), "list missing");
  });

  await step("embeddings generate + save", async () => {
    const generated = await request("POST", "/api/embeddings", {
      token: tokenA,
      body: { text: "green tea dragons" },
      expectStatus: 200,
    });
    const embedding = generated.data?.embedding as number[] | undefined;
    assert(Array.isArray(embedding) && embedding.length > 0, "embedding empty");

    const saved = await request("POST", "/api/embeddings/save", {
      token: tokenA,
      body: { memoryId },
      expectStatus: 200,
    });
    assert(saved.data?.hasEmbedding === true, "saveEmbedding failed");
    return `dims=${embedding.length}`;
  });

  await step("pgvector search + filtering + ranking", async () => {
    await request("POST", "/api/memories", {
      token: tokenA,
      body: {
        chatId,
        characterId: "char-alice",
        content: "The northern kingdom capital is Frosthold.",
        type: "world_information",
        importance: 0.6,
        forceCreate: true,
      },
      expectStatus: 201,
    });

    const search = await request("POST", "/api/search", {
      token: tokenA,
      body: {
        query: "tea and dragons",
        limit: 5,
        similarityThreshold: 0.05,
        characterId: "char-alice",
        types: ["preference"],
        minImportance: 0.5,
      },
      expectStatus: 200,
    });
    const results = search.data?.results as Json[] | undefined;
    assert(Array.isArray(results) && results.length >= 1, "no search results");
    assert(results.every((row) => row.type === "preference"), "type filter failed");
    assert(results.some((row) => row.id === memoryId), "target memory missing");
    assert(typeof results[0]?.rankScore === "number", "rankScore missing");
    assert(typeof results[0]?.similarity === "number", "similarity missing");
  });

  await step("deduplication", async () => {
    const first = await request("POST", "/api/memories", {
      token: tokenA,
      body: {
        content: "Bob is Alice's brother and closest friend.",
        type: "relationship",
        importance: 0.7,
        forceCreate: true,
      },
      expectStatus: 201,
    });
    const firstId = String((first.data?.memory as Json)?.id ?? "");

    const second = await request("POST", "/api/memories", {
      token: tokenA,
      body: {
        content: "Bob is Alice's brother and closest friend.",
        type: "relationship",
        importance: 0.75,
      },
      expectStatus: [200, 201],
    });
    assert(second.data?.deduplicated === true, "expected deduplicated update");
    assert(String((second.data?.memory as Json)?.id) === firstId, "should update same memory");
  });

  await step("context generation", async () => {
    const { data } = await request("POST", "/api/context", {
      token: tokenA,
      body: {
        query: "What does Alice like?",
        chatId,
        characterId: "char-alice",
        memoryLimit: 5,
        messageLimit: 5,
        similarityThreshold: 0.05,
      },
      expectStatus: 200,
    });
    assert(Array.isArray(data?.entries) && (data.entries as Json[]).length >= 1, "no context entries");
    const entry = (data?.entries as Json[])[0]!;
    assert(typeof entry.memory === "string", "entry.memory missing");
    assert(typeof entry.type === "string", "entry.type missing");
    assert(typeof entry.importance === "number", "entry.importance missing");
    assert(typeof entry.relevance === "number", "entry.relevance missing");
    assert(entry.source && typeof (entry.source as Json).memoryId === "string", "entry.source missing");
    assert(typeof data?.contextText === "string" && (data.contextText as string).length > 0, "empty context");
  });

  await step("process message pipeline", async () => {
    const { data } = await request("POST", "/api/memories/process", {
      token: tokenA,
      body: {
        chatId,
        characterId: "char-alice",
        role: "user",
        content: "She prefers jasmine tea in the mornings.",
      },
      expectStatus: 201,
    });
    assert(typeof data?.candidates === "number", "candidates missing");
  });

  await step("user isolation", async () => {
    const bob = await request("POST", "/api/auth/register", {
      body: { username: `bob_${suffix}`, password: "secret123" },
      expectStatus: 201,
    });
    tokenB = String(bob.data?.token ?? "");

    await request("GET", `/api/memories/${memoryId}`, { token: tokenB, expectStatus: 404 });
    await request("DELETE", `/api/memories/${memoryId}`, { token: tokenB, expectStatus: 404 });

    const search = await request("POST", "/api/search", {
      token: tokenB,
      body: { query: "tea and dragons", limit: 10, similarityThreshold: 0.01 },
      expectStatus: 200,
    });
    const results = (search.data?.results as Json[]) ?? [];
    assert(!results.some((row) => row.id === memoryId), "alice memory leaked to bob");
  });

  await request("DELETE", `/api/messages/${messageId}`, { token: tokenA, expectStatus: [204, 404] });
  await request("DELETE", `/api/chats/${chatId}`, { token: tokenA, expectStatus: [204, 404] });

  const failed = results.filter((r) => !r.ok);
  console.log("\n--- Summary ---");
  for (const r of results) {
    console.log(`${r.ok ? "OK" : "XX"} ${r.step}${r.detail ? ` (${r.detail})` : ""}`);
  }

  if (failed.length) {
    process.exitCode = 1;
    console.error(`\n${failed.length} check(s) failed.`);
  } else {
    console.log(`\nAll ${results.length} checks passed.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
