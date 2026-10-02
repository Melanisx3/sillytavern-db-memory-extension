import { Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { getUserId, requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { getMemoryEngine } from "../memory/index.js";
import { MEMORY_TYPES } from "../memory/types.js";

const memoryTypeSchema = z.enum(MEMORY_TYPES as unknown as [string, ...string[]]);

const contextSchema = z.object({
  query: z.string().min(1),
  chatId: z.string().uuid().optional(),
  characterId: z.string().min(1).max(128).optional(),
  types: z.array(memoryTypeSchema).optional(),
  memoryLimit: z.number().int().min(1).max(20).optional(),
  messageLimit: z.number().int().min(0).max(50).optional(),
  similarityThreshold: z.number().min(0).max(1).optional(),
  minRankScore: z.number().min(0).max(1).optional(),
  minImportance: z.number().min(0).max(1).optional(),
});

export const contextRouter = Router();

contextRouter.use(requireAuth);

contextRouter.post("/", validateBody(contextSchema), async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const body = req.body as z.infer<typeof contextSchema>;

    if (body.chatId) {
      const chat = await pool.query(`SELECT id FROM chats WHERE id = $1 AND user_id = $2`, [
        body.chatId,
        userId,
      ]);
      if (!chat.rows[0]) {
        res.status(404).json({ error: "Chat not found" });
        return;
      }
    }

    const engine = getMemoryEngine();
    const memoryContext = await engine.buildMemoryContext({
      userId,
      query: body.query,
      chatId: body.chatId,
      characterId: body.characterId,
      types: body.types as never,
      limit: body.memoryLimit ?? 5,
      similarityThreshold: body.similarityThreshold,
      minImportance: body.minImportance,
      minRankScore: body.minRankScore,
      maxEntries: body.memoryLimit ?? 5,
    });

    let recentMessages: Array<{ id: string; role: string; content: string; createdAt: Date }> = [];
    const messageLimit = body.messageLimit ?? 10;

    if (body.chatId && messageLimit > 0) {
      const messagesResult = await pool.query(
        `SELECT id, role, content, created_at AS "createdAt"
         FROM messages
         WHERE chat_id = $1 AND user_id = $2
         ORDER BY created_at DESC
         LIMIT $3`,
        [body.chatId, userId, messageLimit]
      );
      recentMessages = messagesResult.rows.reverse();
    }

    const messageLines = recentMessages.map((msg) => `${msg.role}: ${msg.content}`);
    const contextText = [
      memoryContext.contextText || null,
      messageLines.length ? "Recent messages:" : null,
      ...messageLines,
    ]
      .filter(Boolean)
      .join("\n");

    res.json({
      query: body.query,
      chatId: body.chatId ?? null,
      characterId: body.characterId ?? null,
      entries: memoryContext.entries,
      recentMessages,
      contextText,
    });
  } catch (error) {
    next(error);
  }
});
