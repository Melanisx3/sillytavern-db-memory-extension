export const config = {
  port: Number(process.env.BACKEND_PORT ?? process.env.PORT ?? 3000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  jwtSecret: process.env.JWT_SECRET ?? "dev-only-change-me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  embedding: {
    /** Provider id — dimensions come from the provider/config, not business logic. */
    provider: (process.env.EMBEDDING_PROVIDER ?? "local-hash") as "local-hash",
    dimensions: Number(process.env.EMBEDDING_DIMENSIONS ?? 384),
  },
  memory: {
    duplicateThreshold: Number(process.env.MEMORY_DUPLICATE_THRESHOLD ?? 0.92),
    nearDuplicateThreshold: Number(process.env.MEMORY_NEAR_DUPLICATE_THRESHOLD ?? 0.84),
    defaultSimilarityThreshold: Number(process.env.MEMORY_SIMILARITY_THRESHOLD ?? 0.2),
  },
  postgres: {
    host: process.env.POSTGRES_HOST ?? "localhost",
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    user: process.env.POSTGRES_USER ?? "app_user",
    password: process.env.POSTGRES_PASSWORD ?? "",
    database: process.env.POSTGRES_DB ?? "sillytavern_memory",
  },
} as const;
