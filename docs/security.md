# Security and guardrails

The threat model includes cross-tenant access, prompt injection in user input and documents, tool abuse, data exfiltration, SSRF, denial of wallet/service, poisoned indexes, supply-chain compromise, and accidental secret logging.

Controls are layered:

1. GKE Gateway terminates TLS and exposes only the gateway service.
2. JWT verification pins issuer, audience, and RS256; tenant identity is never caller-supplied JSON.
3. Zod validates every boundary. Fastify limits body size and time; rate limits apply by identity.
4. The agent has an allowlist of typed tools. Retrieved content is explicitly untrusted and cannot redefine instructions.
5. Cache, SQL, and object paths are tenant-scoped. Use one RAG corpus per tenant/security boundary (the current native ADK tool accepts a configured corpus); never point a shared runtime at a cross-tenant corpus. PostgreSQL row-level security should be added if direct tenant SQL access is introduced.
6. Workload Identity supplies short-lived credentials. Secret Manager and External Secrets provide runtime configuration.
7. Containers run non-root with a read-only filesystem, dropped capabilities, resource limits, probes, and disruption budgets.
8. Logs redact authorization and common PII. Do not log prompts or retrieved chunks by default.
9. Databricks access uses an OAuth M2M service principal, a read-only SQL warehouse, Unity Catalog ABAC/row filters and masks, allowlisted agent-facing views, and mandatory application tenant predicates.

Static regex checks are an early rejection layer, not a complete prompt-injection defense. Production must add model safety filters, DLP scanning, retrieval ACL filters, output validation, groundedness evals, tool confirmation for side effects, and human approval for high-impact operations.

Incident response: revoke workload identity bindings, disable the affected tool/corpus, rotate referenced secrets, invalidate Redis namespaces, preserve immutable audit logs, identify exposed tenant IDs, and follow the notification runbook.
