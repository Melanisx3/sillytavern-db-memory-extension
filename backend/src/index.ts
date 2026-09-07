import { Pool } from "pg";

const pool = new Pool({
  host: process.env.POSTGRES_HOST ?? "localhost",
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
});

async function main(): Promise<void> {
  const client = await pool.connect();

  try {
    const extensionResult = await client.query<{ extname: string; extversion: string }>(
      "SELECT extname, extversion FROM pg_extension WHERE extname = 'vector'"
    );

    const distanceResult = await client.query<{ distance: number }>(
      "SELECT '[1,2,3]'::vector <-> '[1,2,4]'::vector AS distance"
    );

    console.log("Backend placeholder started.");
    console.log("pgvector extension:", extensionResult.rows[0] ?? "not found");
    console.log("vector distance test:", distanceResult.rows[0]?.distance);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("Backend startup failed:", error);
  process.exit(1);
});
