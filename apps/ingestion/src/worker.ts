import {Worker} from 'bullmq';
import {queuedIngestRequestSchema, type QueuedIngestRequest} from '@platform/contracts';
import {database} from '@platform/database';
import {getConfig} from '@platform/config';
import {registerDocument} from './documents.js';
import {INGESTION_QUEUE, redisConnection} from './queue.js';

const config = getConfig();
let settle: (() => void) | undefined;
let reject: ((error: Error) => void) | undefined;
const completed = new Promise<void>((resolve, rejectPromise) => {
  settle = resolve;
  reject = rejectPromise;
});
const worker = new Worker<QueuedIngestRequest>(
  INGESTION_QUEUE,
  async (job) => {
    const payload = queuedIngestRequestSchema.parse(job.data);
    await registerDocument(payload.tenantId, payload);
  },
  {connection: redisConnection(config.QUEUE_REDIS_URL), concurrency: 1, autorun: false},
);
worker.once('completed', () => settle?.());
worker.on('failed', (job, error) => {
  const attempts = job?.opts.attempts ?? 1;
  if ((job?.attemptsMade ?? attempts) >= attempts) reject?.(error);
});

try {
  void worker.run();
  await completed;
} finally {
  await worker.close();
  await database.$disconnect();
}
