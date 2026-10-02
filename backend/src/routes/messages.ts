import { Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { getUserId, requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";

const createMessageSchema = z.object({
  chatId: z.string().uuid(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1),
});

const updateMessageSchema = z.object({
  content: z.string().min(1),
  role: z.enum(["user", "assistant", "system"]).optional(),
});

export const messagesRouter = Router();

messagesRouter.use(requireAuth);

async function assertChatOwnership(chatId: string, userId: string): Promise<boolean> {
  const result = await pool.query(`SELECT id FROM chats WHERE id = $1 AND user_id = $2`, [chatId, userId]);
  return Boolean(result.rows[0]);
}

messagesRouter.get("/", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const chatId = typeof req.query.chatId === "string" ? req.query.chatId : undefined;

    if (chatId) {
      if (!(await assertChatOwnership(chatId, userId))) {
        res.status(404).json({ error: "Chat not found" });
        return;
      }

      const result = await pool.query(
        `SELECT id, chat_id AS "chatId", user_id AS "userId", role, content, created_at AS "createdAt"
         FROM messages
         WHERE chat_id = $1 AND user_id = $2
         ORDER BY created_at ASC`,
        [chatId, userId]
      );
      res.json({ messages: result.rows });
      return;
    }

    const result = await pool.query(
      `SELECT id, chat_id AS "chatId", user_id AS "userId", role, content, created_at AS "createdAt"
       FROM messages
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [userId]
    );
    res.json({ messages: result.rows });
  } catch (error) {
    next(error);
  }
});

messagesRouter.post("/", validateBody(createMessageSchema), async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { chatId, role, content } = req.body as z.infer<typeof createMessageSchema>;

    if (!(await assertChatOwnership(chatId, userId))) {
      res.status(404).json({ error: "Chat not found" });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const result = await client.query(
        `INSERT INTO messages (chat_id, user_id, role, content)
         VALUES ($1, $2, $3, $4)
         RETURNING id, chat_id AS "chatId", user_id AS "userId", role, content, created_at AS "createdAt"`,
        [chatId, userId, role, content]
      );

      await client.query(`UPDATE chats SET updated_at = NOW() WHERE id = $1 AND user_id = $2`, [chatId, userId]);
      await client.query("COMMIT");

      res.status(201).json({ message: result.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
});

messagesRouter.get("/:id", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const result = await pool.query(
      `SELECT id, chat_id AS "chatId", user_id AS "userId", role, content, created_at AS "createdAt"
       FROM messages
       WHERE id = $1 AND user_id = $2`,
      [req.params.id, userId]
    );

    if (!result.rows[0]) {
      res.status(404).json({ error: "Message not found" });
      return;
    }

    res.json({ message: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

messagesRouter.patch("/:id", validateBody(updateMessageSchema), async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { content, role } = req.body as z.infer<typeof updateMessageSchema>;

    const result = await pool.query(
      `UPDATE messages
       SET content = $1,
           role = COALESCE($2, role)
       WHERE id = $3 AND user_id = $4
       RETURNING id, chat_id AS "chatId", user_id AS "userId", role, content, created_at AS "createdAt"`,
      [content, role ?? null, req.params.id, userId]
    );

    if (!result.rows[0]) {
      res.status(404).json({ error: "Message not found" });
      return;
    }

    res.json({ message: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

messagesRouter.delete("/:id", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const result = await pool.query(
      `DELETE FROM messages WHERE id = $1 AND user_id = $2 RETURNING id`,
      [req.params.id, userId]
    );

    if (!result.rows[0]) {
      res.status(404).json({ error: "Message not found" });
      return;
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
