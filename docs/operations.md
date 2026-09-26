# Operations

## SLOs

- Availability: 99.9% successful authenticated chat requests monthly.
- Latency: p95 below 5 seconds for non-streaming cached responses; agent latency is tracked separately.
- Quality: groundedness and citation precision gates must pass the release eval set.

Alerts cover 5xx burn rate, p95/p99 latency, Agent Engine errors, token/cost anomalies, Redis evictions, PostgreSQL saturation, ingestion backlog, guardrail rejection spikes, and missing citations.

Deployments use immutable image SHAs, rolling updates, readiness probes, PDB, and progressive promotion. The gateway has a fixed highly available replica count. Pub/Sub backlog drives KEDA `ScaledJob` ingestion workers from zero to the configured concurrency ceiling; no application HPA manifest is used. Database changes use expand/migrate/contract. Roll back application images independently from schema migrations. Restore tests for Cloud SQL and corpus recreation are required quarterly.

Run `npm run check`, container scanning, dependency review, IaC validation, and RAG evals before promotion. Load-test with realistic tenant distribution and enforce quota budgets at the gateway and Vertex project levels.
