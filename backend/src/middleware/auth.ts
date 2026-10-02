import type { NextFunction, Request, Response } from "express";
import { verifyToken } from "../services/auth.js";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      username?: string;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  try {
    const payload = verifyToken(header.slice("Bearer ".length));
    req.userId = payload.sub;
    req.username = payload.username;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function getUserId(req: Request): string {
  if (!req.userId) {
    throw new Error("Authenticated request is missing userId");
  }
  return req.userId;
}

export function getRouteParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}
