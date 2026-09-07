-- Initial database setup: enable pgvector extension.
-- Runs automatically on first PostgreSQL container start.

CREATE EXTENSION IF NOT EXISTS vector;
