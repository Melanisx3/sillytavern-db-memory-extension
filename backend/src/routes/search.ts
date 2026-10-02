import { Router } from "express";
import { z } from "zod";
import { getUserId, requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { getMemoryEngine } from "../memory/index.js";
import { MEMORY_TYPES } from "../memory/types.js";

const memoryTypeSchema = z.enum(MEMORY_TYPES as unknown as [string, ...string[]]);

const searchSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(50).optional(),
  similarityThreshold: z.number().min(0).max(1).optional(),
  chatId: z.string().uuid().optional(),
  characterId: z.string().min(1).max(128).optional(),
  types: z.array(memoryTypeSchema).optional(),
  minImportance: z.number().min(0).max(1).optional(),
  similarityWeight: z.number().min(0).max(1).optional(),
  importanceWeight: z.number().min(0).max(1).optional(),
});

export const searchRouter = Router();

searchRouter.use(requireAuth);

searchRouter.post("/", validateBody(searchSchema), async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const body = req.body as z.infer<typeof searchSchema>;
    const results = await getMemoryEngine().semanticSearch({
      userId,
      query: body.query,
      limit: body.limit,
      similarityThreshold: body.similarityThreshold,
      chatId: body.chatId,
      characterId: body.characterId,
      types: body.types as never,
      minImportance: body.minImportance,
      similarityWeight: body.similarityWeight,
      importanceWeight: body.importanceWeight,
    });

    res.json({
      query: body.query,
      results: results.map((row) => ({
        id: row.id,
        userId: row.userId,
        chatId: row.chatId,
        characterId: row.characterId,
        content: row.content,
        type: row.type,
        importance: row.importance,
        confidence: row.confidence,
        similarity: row.similarity,
        rankScore: row.rankScore,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
    });
  } catch (error) {
    next(error);
  }
});
