# High-level design: Databricks governed retrieval

## Purpose

This design lets the Google ADK agent answer from governed Databricks data without exporting the lakehouse into another vector database. Vertex AI RAG remains optional for document collections that already live in GCP.

## System context

```mermaid
flowchart TB
  Client[Enterprise client] --> Edge[GKE Gateway API]
  Edge --> Gateway[Fastify policy gateway]
  Gateway --> Engine[Vertex AI Agent Engine]
  Engine --> Agent[Google ADK agent]
  Agent -->|structured tool| SQLPort[Databricks retrieval port]
  Agent -->|semantic tool| VectorPort[Databricks retrieval port]
  SQLPort --> OAuth[Databricks OAuth M2M]
  VectorPort --> OAuth
  SQLPort --> Warehouse[Serverless SQL Warehouse]
  VectorPort --> Search[Databricks AI Search]
  Warehouse --> UC[Unity Catalog]
  Search --> Delta[(Delta tables)]
  UC --> Delta
  Agent -->|optional hybrid path| Vertex[Vertex AI RAG]
  Secrets[GCP Secret Manager] -. credentials .-> Engine
  Audit[Cloud Logging + Databricks system tables] -. telemetry .-> Gateway
  Audit -. telemetry .-> Warehouse
```

## Responsibilities

| Component         | Responsibility                                                                     |
| ----------------- | ---------------------------------------------------------------------------------- |
| Gateway           | OIDC authentication, trusted tenant derivation, rate limits, input guardrails      |
| Agent Engine      | Managed ADK execution, model calls, session lifecycle, traces                      |
| ADK tools         | Expose narrow semantic and structured capabilities; never arbitrary SQL            |
| Retrieval adapter | OAuth token caching, tenant predicates, allowlists, quotas, response normalization |
| SQL Warehouse     | Execute bounded parameterized reads against governed views                         |
| AI Search         | Hybrid semantic retrieval with mandatory `tenant_id` metadata filter               |
| Unity Catalog     | Grants, ABAC/row filters, column masks, lineage, audit controls                    |

## Deployment modes

- `vertex`: native Vertex RAG only.
- `databricks`: Databricks AI Search and governed SQL only.
- `hybrid`: Databricks for live lakehouse data plus Vertex RAG for approved GCP documents.

## Trust boundaries

```mermaid
flowchart LR
  subgraph Public
    User[Caller]
  end
  subgraph GCP[Trusted GCP boundary]
    GW[Gateway]
    AE[Agent Engine]
    SM[Secret Manager]
  end
  subgraph DBX[Databricks workspace boundary]
    OAUTH[OAuth]
    SQL[SQL Warehouse]
    VS[AI Search]
    UC[Unity Catalog]
  end
  User -->|untrusted input| GW
  GW -->|verified identity and tenant state| AE
  SM -.->|M2M secret| AE
  AE -->|short-lived bearer token| OAUTH
  AE --> SQL
  AE --> VS
  UC --> SQL
  UC --> VS
```

Defense in depth requires both application tenant predicates and Unity Catalog policies. An application filter is not a replacement for row filters, column masks, or ABAC.

## Scale and availability

The services are stateless. OAuth tokens are cached per process until one minute before expiry. Agent Engine and the SQL warehouse scale independently. AI Search serves semantic traffic separately from analytical SQL. Set explicit Databricks warehouse concurrency, autoscaling, and spend policies; apply gateway and tenant quotas to prevent noisy-neighbor and denial-of-wallet incidents.

## Key decisions

1. REST APIs are used instead of JDBC/Thrift to keep the runtime lightweight and compatible with Agent Engine.
2. Semantic search sends `query_text`; Databricks manages the embedding model associated with the Delta Sync index.
3. The model chooses a tool but never controls credentials, tenant identity, SQL syntax, warehouse IDs, or index names.
4. SQL reads only pre-approved three-part Unity Catalog views. Views are designed as agent-facing contracts and carry a `tenant_id` column.
5. Result limits and timeouts are enforced both by the adapter and Databricks Statement Execution API.
