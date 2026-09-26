import {z} from 'zod';

const bool = z.string().transform((v) => v.toLowerCase() === 'true');
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  PORT: z.coerce.number().int().positive().default(8080),
  AGENT_SERVICE_URL: z.string().url().default('http://localhost:8081'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().url(),
  GCP_PROJECT_ID: z.string().min(1),
  GCP_LOCATION: z.string().default('us-central1'),
  GOOGLE_GENAI_USE_VERTEXAI: bool.default(true),
  VERTEX_RAG_CORPUS: z.string().min(1),
  AGENT_MODEL: z.string().default('gemini-2.5-flash'),
  JWT_ISSUER: z.string().url(),
  JWT_AUDIENCE: z.string().min(1),
  CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(86400),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW: z.string().default('1 minute'),
});

export type Config = z.infer<typeof schema>;
let memo: Config | undefined;
export const getConfig = (): Config => (memo ??= schema.parse(process.env));
