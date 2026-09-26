import Fastify from 'fastify';
import {ingestRequestSchema} from '@platform/contracts';
import {getConfig} from '@platform/config';
import {createIngestionQueue} from './queue.js';

const config = getConfig();
const app = Fastify({logger: {level: config.LOG_LEVEL}, bodyLimit: 16_384});
const queue = createIngestionQueue(config.QUEUE_REDIS_URL);
app.get('/health/live', () => ({status: 'ok'}));
app.get('/health/ready', () => ({status: 'ready'}));
app.post('/internal/v1/documents', async (req, reply) => {
  const tenantId = req.headers['x-tenant-id'];
  if (typeof tenantId !== 'string') return reply.code(401).send({error: 'missing_identity'});
  const input = ingestRequestSchema.safeParse(req.body);
  if (!input.success)
    return reply.code(400).send({error: 'invalid_request', details: input.error.issues});
  const job = await queue.add(
    'index-document',
    {...input.data, tenantId},
    {
      jobId: `doc-${Buffer.from(`${tenantId}:${input.data.uri}`).toString('base64url')}`,
    },
  );
  return reply.code(202).send({jobId: job.id, status: 'queued'});
});
app.addHook('onClose', async () => queue.close());
await app.listen({host: '0.0.0.0', port: config.PORT || 8082});
