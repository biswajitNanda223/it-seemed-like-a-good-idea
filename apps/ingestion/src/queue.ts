import {Queue, type RedisOptions} from 'bullmq';
import type {QueuedIngestRequest} from '@platform/contracts';

export const INGESTION_QUEUE = 'ingestion';
export const INGESTION_WAIT_KEY = `bull:${INGESTION_QUEUE}:wait`;

export const redisConnection = (redisUrl: string): RedisOptions => {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    ...(url.username ? {username: decodeURIComponent(url.username)} : {}),
    ...(url.password ? {password: decodeURIComponent(url.password)} : {}),
    ...(url.protocol === 'rediss:' ? {tls: {servername: url.hostname}} : {}),
    maxRetriesPerRequest: null,
  };
};

export const createIngestionQueue = (redisUrl: string) =>
  new Queue<QueuedIngestRequest>(INGESTION_QUEUE, {
    connection: {...redisConnection(redisUrl), maxRetriesPerRequest: 2},
    defaultJobOptions: {
      attempts: 5,
      backoff: {type: 'exponential', delay: 5_000},
      removeOnComplete: {age: 86_400, count: 1_000},
      removeOnFail: {age: 604_800, count: 5_000},
    },
  });
