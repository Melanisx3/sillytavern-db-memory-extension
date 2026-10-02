import { Pool } from "pg";
import { config } from "./config.js";

export const pool = new Pool({
  host: config.postgres.host,
  port: config.postgres.port,
  user: config.postgres.user,
  password: config.postgres.password,
  database: config.postgres.database,
});

export async function verifyDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("SELECT 1");

    const extensionResult = await client.query<{ extname: string; extversion: string }>(
      "SELECT extname, extversion FROM pg_extension WHERE extname = 'vector'"
    );

    if (!extensionResult.rows[0]) {
      throw new Error("pgvector extension 'vector' is not installed");
    }

    const distanceResult = await client.query<{ distance: number }>(
      "SELECT '[1,2,3]'::vector <-> '[1,2,4]'::vector AS distance"
    );

    console.log("PostgreSQL connected.");
    console.log("pgvector extension:", extensionResult.rows[0]);
    console.log("vector distance test:", distanceResult.rows[0]?.distance);
  } finally {
    client.release();
  }
}
