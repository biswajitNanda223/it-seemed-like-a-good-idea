import {describe, expect, it} from 'vitest';
import {INGESTION_WAIT_KEY, redisConnection} from './queue.js';

describe('BullMQ queue configuration', () => {
  it('uses the stable waiting-list key consumed by KEDA', () => {
    expect(INGESTION_WAIT_KEY).toBe('bull:ingestion:wait');
  });

  it('parses authenticated TLS Redis endpoints without exposing credentials', () => {
    expect(redisConnection('rediss://worker:secret@queue.internal:6380')).toMatchObject({
      host: 'queue.internal',
      port: 6380,
      username: 'worker',
      password: 'secret',
      tls: {servername: 'queue.internal'},
      maxRetriesPerRequest: null,
    });
  });
});
