import { Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { getUserId, requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";

const createChatSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
});

const updateChatSchema = z.object({
  title: z.string().trim().min(1).max(200),
});

export const chatsRouter = Router();

chatsRouter.use(requireAuth);

chatsRouter.get("/", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const result = await pool.query(
      `SELECT id, user_id AS "userId", title, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM chats
       WHERE user_id = $1
       ORDER BY updated_at DESC`,
      [userId]
    );
    res.json({ chats: result.rows });
  } catch (error) {
    next(error);
  }
});

chatsRouter.post("/", validateBody(createChatSchema), async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { title } = req.body as z.infer<typeof createChatSchema>;

    const result = await pool.query(
      `INSERT INTO chats (user_id, title)
       VALUES ($1, $2)
       RETURNING id, user_id AS "userId", title, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [userId, title ?? "New Chat"]
    );

    res.status(201).json({ chat: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

chatsRouter.get("/:id", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const result = await pool.query(
      `SELECT id, user_id AS "userId", title, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM chats
       WHERE id = $1 AND user_id = $2`,
      [req.params.id, userId]
    );

    if (!result.rows[0]) {
      res.status(404).json({ error: "Chat not found" });
      return;
    }

    res.json({ chat: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

chatsRouter.patch("/:id", validateBody(updateChatSchema), async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { title } = req.body as z.infer<typeof updateChatSchema>;

    const result = await pool.query(
      `UPDATE chats
       SET title = $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $3
       RETURNING id, user_id AS "userId", title, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [title, req.params.id, userId]
    );

    if (!result.rows[0]) {
      res.status(404).json({ error: "Chat not found" });
      return;
    }

    res.json({ chat: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

chatsRouter.delete("/:id", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const result = await pool.query(
      `DELETE FROM chats WHERE id = $1 AND user_id = $2 RETURNING id`,
      [req.params.id, userId]
    );

    if (!result.rows[0]) {
      res.status(404).json({ error: "Chat not found" });
      return;
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
