import Fastify from 'fastify';
import {randomUUID} from 'node:crypto';
import {chatRequestSchema} from '@platform/contracts';
import {inspectUserInput} from '@platform/security';
import {getConfig} from '@platform/config';

const config = getConfig();
const app = Fastify({logger: {level: config.LOG_LEVEL}, bodyLimit: 32_768});
app.get('/health/live', () => ({status: 'ok'}));
app.get('/health/ready', () => ({status: 'ready'}));
app.post('/internal/v1/chat', async (req, reply) => {
  const tenantId = req.headers['x-tenant-id'];
  const userId = req.headers['x-user-id'];
  if (typeof tenantId !== 'string' || typeof userId !== 'string')
    return reply.code(401).send({error: 'missing_identity'});
  const parsed = chatRequestSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({error: 'invalid_request'});
  if (!inspectUserInput(parsed.data.message).allowed)
    return reply.code(422).send({error: 'unsafe_input'});
  // Local HTTP adapter stays deterministic. Production invokes rootAgent on Agent Engine.
  return {
    sessionId: parsed.data.sessionId ?? randomUUID(),
    answer:
      'Agent Engine adapter is not configured. Deploy the exported rootAgent and set AGENT_SERVICE_URL.',
    citations: [],
    requestId: String(req.headers['x-request-id'] ?? req.id),
  };
});
await app.listen({host: '0.0.0.0', port: config.PORT || 8081});
