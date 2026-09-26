import {Redis} from 'ioredis';

export interface Cache {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  deleteByPrefix(prefix: string): Promise<void>;
  close(): Promise<void>;
}

export class RedisCache implements Cache {
  readonly #redis: Redis;
  constructor(url: string) {
    this.#redis = new Redis(url, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: true,
    });
  }
  async get<T>(key: string): Promise<T | undefined> {
    const value = await this.#redis.get(key);
    return value === null ? undefined : (JSON.parse(value) as T);
  }
  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.#redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }
  async deleteByPrefix(prefix: string): Promise<void> {
    let cursor = '0';
    do {
      const [next, keys] = await this.#redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 100);
      cursor = next;
      if (keys.length > 0) await this.#redis.unlink(...keys);
    } while (cursor !== '0');
  }
  async close(): Promise<void> {
    await this.#redis.quit();
  }
}

export const scopedKey = (tenantId: string, namespace: string, id: string): string =>
  `v1:${tenantId}:${namespace}:${id}`;
