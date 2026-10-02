import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "../config.js";

export interface AuthTokenPayload {
  sub: string;
  username: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export function signToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  } as jwt.SignOptions);
}

export function verifyToken(token: string): AuthTokenPayload {
  const decoded = jwt.verify(token, config.jwtSecret);
  if (typeof decoded !== "object" || decoded === null || typeof decoded.sub !== "string") {
    throw new Error("Invalid token payload");
  }

  return {
    sub: decoded.sub,
    username: typeof decoded.username === "string" ? decoded.username : "",
  };
}
