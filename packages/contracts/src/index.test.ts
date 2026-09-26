import {describe, expect, it} from 'vitest';
import {chatRequestSchema, ingestRequestSchema} from './index.js';

describe('boundary contracts', () => {
  it('limits prompt size', () =>
    expect(chatRequestSchema.safeParse({message: 'x'.repeat(16_001)}).success).toBe(false));
  it('accepts only GCS ingestion sources', () =>
    expect(
      ingestRequestSchema.safeParse({uri: 'https://evil.test/a', displayName: 'a'}).success,
    ).toBe(false));
});
