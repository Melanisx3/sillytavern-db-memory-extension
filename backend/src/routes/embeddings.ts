import { Router } from "express";
import { z } from "zod";
import { getUserId, requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { getMemoryEngine } from "../memory/index.js";

const embedSchema = z.object({
  text: z.string().min(1),
});

const saveEmbeddingSchema = z.object({
  memoryId: z.string().uuid(),
  text: z.string().min(1).optional(),
});

export const embeddingsRouter = Router();

embeddingsRouter.use(requireAuth);

embeddingsRouter.post("/", validateBody(embedSchema), async (req, res, next) => {
  try {
    const engine = getMemoryEngine();
    const { text } = req.body as z.infer<typeof embedSchema>;
    const embedding = await engine.generateEmbedding(text);

    res.json({
      embedding,
      dimensions: engine.embeddingDimensions,
      model: engine.embeddingProviderName,
    });
  } catch (error) {
    next(error);
  }
});

embeddingsRouter.post("/save", validateBody(saveEmbeddingSchema), async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const engine = getMemoryEngine();
    const { memoryId, text } = req.body as z.infer<typeof saveEmbeddingSchema>;
    const embedding = text ? await engine.generateEmbedding(text) : undefined;
    const memory = await engine.saveEmbedding(memoryId, userId, embedding);

    res.json({
      memoryId: memory.id,
      dimensions: engine.embeddingDimensions,
      model: engine.embeddingProviderName,
      hasEmbedding: Array.isArray(memory.embedding),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Memory not found") {
      res.status(404).json({ error: "Memory not found" });
      return;
    }
    next(error);
  }
});
