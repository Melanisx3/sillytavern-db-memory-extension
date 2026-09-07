-- Verify pgvector extension is installed and working.

\echo '=== pgvector extension ==='
SELECT extname, extversion
FROM pg_extension
WHERE extname = 'vector';

\echo '=== vector distance query ==='
SELECT '[1,2,3]'::vector <-> '[1,2,4]'::vector AS distance;

\echo '=== vector similarity query ==='
SELECT 1 - ('[1,2,3]'::vector <=> '[1,2,4]'::vector) AS cosine_similarity;
