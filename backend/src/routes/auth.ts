import { Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { validateBody } from "../middleware/validate.js";
import { hashPassword, signToken, verifyPassword } from "../services/auth.js";

const credentialsSchema = z.object({
  username: z.string().trim().min(3).max(64),
  password: z.string().min(6).max(128),
});

export const authRouter = Router();

authRouter.post("/register", validateBody(credentialsSchema), async (req, res, next) => {
  try {
    const { username, password } = req.body as z.infer<typeof credentialsSchema>;
    const passwordHash = await hashPassword(password);

    const result = await pool.query<{ id: string; username: string; created_at: Date }>(
      `INSERT INTO users (username, password_hash)
       VALUES ($1, $2)
       RETURNING id, username, created_at`,
      [username, passwordHash]
    );

    const user = result.rows[0];
    const token = signToken({ sub: user.id, username: user.username });

    res.status(201).json({
      token,
      user: {
        id: user.id,
        username: user.username,
        createdAt: user.created_at,
      },
    });
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      res.status(409).json({ error: "Username already taken" });
      return;
    }
    next(error);
  }
});

authRouter.post("/login", validateBody(credentialsSchema), async (req, res, next) => {
  try {
    const { username, password } = req.body as z.infer<typeof credentialsSchema>;

    const result = await pool.query<{ id: string; username: string; password_hash: string; created_at: Date }>(
      `SELECT id, username, password_hash, created_at FROM users WHERE username = $1`,
      [username]
    );

    const user = result.rows[0];
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      res.status(401).json({ error: "Invalid username or password" });
      return;
    }

    const token = signToken({ sub: user.id, username: user.username });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        createdAt: user.created_at,
      },
    });
  } catch (error) {
    next(error);
  }
});
