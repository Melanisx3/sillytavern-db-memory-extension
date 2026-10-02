import { Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { getRouteParam, getUserId, requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { getMemoryEngine } from "../memory/index.js";
import { MEMORY_TYPES } from "../memory/types.js";

const memoryTypeSchema = z.enum(MEMORY_TYPES as unknown as [string, ...string[]]);

const createMemorySchema = z.object({
  content: z.string().min(1),
  chatId: z.string().uuid().nullable().optional(),
  characterId: z.string().min(1).max(128).nullable().optional(),
  type: memoryTypeSchema.optional(),
  importance: z.number().min(0).max(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
  sourceMessageId: z.string().uuid().nullable().optional(),
  forceCreate: z.boolean().optional(),
});

const updateMemorySchema = z.object({
  content: z.string().min(1).optional(),
  chatId: z.string().uuid().nullable().optional(),
  characterId: z.string().min(1).max(128).nullable().optional(),
  type: memoryTypeSchema.optional(),
  importance: z.number().min(0).max(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
  sourceMessageId: z.string().uuid().nullable().optional(),
  reembed: z.boolean().optional(),
});

const processMessageSchema = z.object({
  content: z.string().min(1),
  role: z.enum(["user", "assistant", "system"]).default("user"),
  chatId: z.string().uuid().nullable().optional(),
  characterId: z.string().min(1).max(128).nullable().optional(),
  sourceMessageId: z.string().uuid().nullable().optional(),
});

export const memoriesRouter = Router();

memoriesRouter.use(requireAuth);

async function assertOptionalChatOwnership(
  chatId: string | null | undefined,
  userId: string
): Promise<boolean> {
  if (!chatId) {
    return true;
  }
  const result = await pool.query(`SELECT id FROM chats WHERE id = $1 AND user_id = $2`, [chatId, userId]);
  return Boolean(result.rows[0]);
}

function publicMemory(memory: {
  id: string;
  userId: string;
  chatId: string | null;
  characterId: string | null;
  content: string;
  type: string;
  importance: number;
  confidence: number;
  sourceMessageId: string | null;
  embedding: number[] | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: memory.id,
    userId: memory.userId,
    chatId: memory.chatId,
    characterId: memory.characterId,
    content: memory.content,
    type: memory.type,
    importance: memory.importance,
    confidence: memory.confidence,
    sourceMessageId: memory.sourceMessageId,
    hasEmbedding: Array.isArray(memory.embedding),
    embeddingDimensions: memory.embedding?.length ?? null,
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt,
  };
}

memoriesRouter.get("/", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const engine = getMemoryEngine();
    const typeQuery = typeof req.query.type === "string" ? req.query.type : undefined;

    const memories = await engine.listMemories({
      userId,
      chatId: typeof req.query.chatId === "string" ? req.query.chatId : undefined,
      characterId: typeof req.query.characterId === "string" ? req.query.characterId : undefined,
      type: typeQuery && MEMORY_TYPES.includes(typeQuery as never) ? (typeQuery as never) : undefined,
      minImportance:
        typeof req.query.minImportance === "string" ? Number(req.query.minImportance) : undefined,
      limit: typeof req.query.limit === "string" ? Number(req.query.limit) : undefined,
      offset: typeof req.query.offset === "string" ? Number(req.query.offset) : undefined,
    });

    res.json({ memories: memories.map(publicMemory) });
  } catch (error) {
    next(error);
  }
});

memoriesRouter.post("/", validateBody(createMemorySchema), async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const body = req.body as z.infer<typeof createMemorySchema>;

    if (!(await assertOptionalChatOwnership(body.chatId, userId))) {
      res.status(404).json({ error: "Chat not found" });
      return;
    }

    const engine = getMemoryEngine();
    const result = await engine.createMemory({
      userId,
      content: body.content,
      chatId: body.chatId,
      characterId: body.characterId,
      type: body.type as never,
      importance: body.importance,
      confidence: body.confidence,
      sourceMessageId: body.sourceMessageId,
      forceCreate: body.forceCreate,
    });

    res.status(result.deduplicated ? 200 : 201).json({
      memory: publicMemory(result.memory),
      deduplicated: result.deduplicated,
    });
  } catch (error) {
    next(error);
  }
});

memoriesRouter.post("/process", validateBody(processMessageSchema), async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const body = req.body as z.infer<typeof processMessageSchema>;

    if (!(await assertOptionalChatOwnership(body.chatId, userId))) {
      res.status(404).json({ error: "Chat not found" });
      return;
    }

    const engine = getMemoryEngine();
    const result = await engine.processMessage({
      userId,
      content: body.content,
      role: body.role,
      chatId: body.chatId,
      characterId: body.characterId,
      sourceMessageId: body.sourceMessageId,
    });

    res.status(201).json({
      candidates: result.candidates,
      created: result.created.map(publicMemory),
      updated: result.updated.map(publicMemory),
    });
  } catch (error) {
    next(error);
  }
});

memoriesRouter.get("/:id", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const memory = await getMemoryEngine().getMemory(getRouteParam(req.params.id), userId);
    if (!memory) {
      res.status(404).json({ error: "Memory not found" });
      return;
    }
    res.json({ memory: publicMemory(memory) });
  } catch (error) {
    next(error);
  }
});

memoriesRouter.patch("/:id", validateBody(updateMemorySchema), async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const body = req.body as z.infer<typeof updateMemorySchema>;

    if (body.chatId !== undefined && !(await assertOptionalChatOwnership(body.chatId, userId))) {
      res.status(404).json({ error: "Chat not found" });
      return;
    }

    try {
      const memory = await getMemoryEngine().updateMemory(getRouteParam(req.params.id), userId, {
        content: body.content,
        chatId: body.chatId,
        characterId: body.characterId,
        type: body.type as never,
        importance: body.importance,
        confidence: body.confidence,
        sourceMessageId: body.sourceMessageId,
        reembed: body.reembed,
      });
      res.json({ memory: publicMemory(memory) });
    } catch (error) {
      if (error instanceof Error && error.message === "Memory not found") {
        res.status(404).json({ error: "Memory not found" });
        return;
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

memoriesRouter.delete("/:id", async (req, res, next) => {
  try {
    const deleted = await getMemoryEngine().deleteMemory(getRouteParam(req.params.id), getUserId(req));
    if (!deleted) {
      res.status(404).json({ error: "Memory not found" });
      return;
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
