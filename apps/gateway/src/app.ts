import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, {type FastifyInstance} from 'fastify';
import {request} from 'undici';
import {RedisCache, scopedKey} from '@platform/cache';
import {getConfig} from '@platform/config';
import {chatRequestSchema, chatResponseSchema, type Principal} from '@platform/contracts';
import {inspectUserInput, JwtAuthenticator} from '@platform/security';

declare module 'fastify' {
  interface FastifyRequest {
    principal: Principal;
  }
}

export async function buildApp(): Promise<FastifyInstance> {
  const config = getConfig();
  const app = Fastify({
    logger: {level: config.LOG_LEVEL, redact: ['req.headers.authorization', '*.token']},
    bodyLimit: 32_768,
    requestTimeout: 30_000,
  });
  const cache = new RedisCache(config.REDIS_URL);
  const auth = new JwtAuthenticator(config.JWT_ISSUER, config.JWT_AUDIENCE);

  await app.register(helmet, {global: true});
  await app.register(cors, {origin: false});
  await app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW,
    keyGenerator: (req) => req.headers.authorization?.slice(-32) ?? req.ip,
  });

  app.addHook('onRequest', async (req, reply) => {
    if (req.url === '/health/live' || req.url === '/health/ready') return;
    try {
      req.principal = await auth.authenticate(req.headers.authorization);
    } catch {
      return reply.code(401).send({error: 'unauthorized'});
    }
  });

  app.get('/health/live', () => ({status: 'ok'}));
  app.get('/health/ready', () => ({status: 'ready'}));

  app.post('/v1/chat', async (req, reply) => {
    const parsed = chatRequestSchema.safeParse(req.body);
    if (!parsed.success)
      return reply.code(400).send({error: 'invalid_request', details: parsed.error.issues});
    const guardrail = inspectUserInput(parsed.data.message);
    if (!guardrail.allowed)
      return reply.code(422).send({error: 'unsafe_input', reason: guardrail.reason});
    const cacheKey = scopedKey(
      req.principal.tenantId,
      'answer',
      Buffer.from(parsed.data.message).toString('base64url').slice(0, 96),
    );
    const cached = await cache.get<unknown>(cacheKey);
    if (cached) return chatResponseSchema.parse(cached);
    const upstream = await request(`${config.AGENT_SERVICE_URL}/internal/v1/chat`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': req.principal.tenantId,
        'x-user-id': req.principal.subject,
        'x-request-id': req.id,
      },
      body: JSON.stringify(parsed.data),
    });
    const result = await upstream.body.json();
    if (upstream.statusCode >= 400) return reply.code(upstream.statusCode).send(result);
    const response = chatResponseSchema.parse(result);
    await cache.set(cacheKey, response, config.CACHE_TTL_SECONDS);
    return response;
  });

  app.addHook('onClose', async () => cache.close());
  app.setErrorHandler((error, req, reply) => {
    req.log.error({err: error, requestId: req.id}, 'request failed');
    void reply.code(500).send({error: 'internal_error', requestId: req.id});
  });
  return app;
}
