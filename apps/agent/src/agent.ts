import {LlmAgent, VertexAiRagMemoryService, VertexRagRetrievalTool} from '@google/adk';
import {getConfig} from '@platform/config';
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

export const rootAgent = new LlmAgent({
  name: 'enterprise_rag_agent',
  description: 'A secure, citation-first semantic RAG assistant.',
  model: config.AGENT_MODEL,
  instruction: SYSTEM_INSTRUCTION,
  tools: [ragTool],
});
