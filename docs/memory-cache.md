# Memory and cache management

Memory is deliberately split:

- Working context: the current bounded turn window sent to Gemini.
- Session memory: durable messages and rolling summaries in PostgreSQL or Agent Engine sessions.
- Long-term semantic memory: tenant documents in Vertex AI RAG.
- Response cache: Redis, tenant-scoped, short-lived, and never authoritative.

Use a token budget rather than an unbounded message count. Keep recent turns verbatim, summarize older turns, and persist the summary with an optimistic `version`. Exclude credentials, raw identity tokens, health data, and payment data from summaries. Set session expiry and run a deletion job to enforce retention.

Response-cache keys follow `v1:{tenant}:namespace:id`. TTLs prevent stale answers; ingestion completion invalidates the tenant document/answer namespace. Use `SCAN` + `UNLINK`, never `KEYS`, for invalidation. The response cache may use LRU/LFU eviction.

BullMQ uses a separate Redis instance configured through `QUEUE_REDIS_URL`. It must use `maxmemory-policy=noeviction`; eviction can corrupt queue state. Enable persistence, TLS/auth, private networking, and alert on memory pressure, failed jobs, stalled jobs, and backlog age. Never share the BullMQ Redis instance with the evicting response cache in production.

Do not cache errors, unsafe responses, personalized answers without a user dimension, or answers whose authorization depends on volatile ACLs.
