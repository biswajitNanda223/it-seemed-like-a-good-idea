import {v1} from '@google-cloud/pubsub';
import {queuedIngestRequestSchema} from '@platform/contracts';
import {database} from '@platform/database';
import {getConfig} from '@platform/config';
import {registerDocument} from './documents.js';

const config = getConfig();
const subscription = process.env['PUBSUB_INGESTION_SUBSCRIPTION'];
if (!subscription) throw new Error('PUBSUB_INGESTION_SUBSCRIPTION is required');

const subscriber = new v1.SubscriberClient();
const [response] = await subscriber.pull(
  {subscription, maxMessages: 1},
  {timeout: 60_000, otherArgs: {headers: {'x-goog-user-project': config.GCP_PROJECT_ID}}},
);
const message = response.receivedMessages?.[0];
if (!message?.message?.data || !message.ackId) process.exit(0);

try {
  const payload = queuedIngestRequestSchema.parse(
    JSON.parse(Buffer.from(message.message.data).toString('utf8')),
  );
  await registerDocument(payload.tenantId, payload);
  await subscriber.acknowledge({subscription, ackIds: [message.ackId]});
} finally {
  await subscriber.close();
  await database.$disconnect();
}
