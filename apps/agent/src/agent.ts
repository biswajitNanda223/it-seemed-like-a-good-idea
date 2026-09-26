import {
  FunctionTool,
  LlmAgent,
  VertexAiRagMemoryService,
  VertexRagRetrievalTool,
} from '@google/adk';
import {z} from 'zod';
import {getConfig} from '@platform/config';
import {DatabricksClient} from '@platform/databricks';
import {SYSTEM_INSTRUCTION} from './prompts.js';

const config = getConfig();
const ragTool = new VertexRagRetrievalTool({
  ragResources: [{ragCorpus: config.VERTEX_RAG_CORPUS}],
  similarityTopK: 8,
});

export const memoryService = new VertexAiRagMemoryService({
  ragCorpus: config.VERTEX_RAG_CORPUS,
  projectId: config.GCP_PROJECT_ID,
  location: config.GCP_LOCATION,
  similarityTopK: 8,
  vectorDistanceThreshold: 0.8,
});

const databricks =
  config.RETRIEVAL_BACKEND === 'vertex'
    ? undefined
    : new DatabricksClient({
        host: config.DATABRICKS_HOST!,
        clientId: config.DATABRICKS_CLIENT_ID!,
        clientSecret: config.DATABRICKS_CLIENT_SECRET!,
        warehouseId: config.DATABRICKS_SQL_WAREHOUSE_ID!,
        vectorIndex: config.DATABRICKS_VECTOR_INDEX!,
        vectorColumns: config.DATABRICKS_VECTOR_COLUMNS.split(',').map((value) => value.trim()),
        allowedViews: config.DATABRICKS_ALLOWED_VIEWS.split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      });

const semanticDatabricksTool = new FunctionTool({
  name: 'search_databricks_knowledge',
  description:
    'Search governed Databricks knowledge using hybrid semantic search. Use for tenant data and cite sourceUri values.',
  parameters: z
    .object({query: z.string().min(3).max(1000), limit: z.number().int().min(1).max(20).default(8)})
    .strict(),
  execute: async ({query, limit}, context) => {
    const tenantId = context?.state.get<string>('user:tenant_id');
    if (!databricks || !tenantId) throw new Error('Databricks retrieval context is unavailable');
    return {results: await databricks.semanticSearch(query, tenantId, limit)};
  },
});

const structuredDatabricksTool = new FunctionTool({
  name: 'query_databricks_view',
  description:
    'Read an allowlisted governed Databricks view. The platform enforces tenant filtering and result limits; arbitrary SQL is not accepted.',
  parameters: z
    .object({
      view: z.string().describe('Three-part allowlisted Unity Catalog view name.'),
      columns: z.array(z.string()).max(20).default(['*']),
      filters: z.record(z.string(), z.string()).default({}),
    })
    .strict(),
  execute: ({view, columns, filters}, context) => {
    const tenantId = context?.state.get<string>('user:tenant_id');
    if (!databricks || !tenantId) throw new Error('Databricks retrieval context is unavailable');
    return databricks.queryView(view, tenantId, filters, columns);
  },
});

const tools =
  config.RETRIEVAL_BACKEND === 'vertex'
    ? [ragTool]
    : config.RETRIEVAL_BACKEND === 'databricks'
      ? [semanticDatabricksTool, structuredDatabricksTool]
      : [ragTool, semanticDatabricksTool, structuredDatabricksTool];

export const rootAgent = new LlmAgent({
  name: 'enterprise_rag_agent',
  description: 'A secure, citation-first semantic RAG assistant.',
  model: config.AGENT_MODEL,
  instruction: SYSTEM_INSTRUCTION,
  tools,
});
