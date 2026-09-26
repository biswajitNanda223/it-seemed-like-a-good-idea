import {z} from 'zod';

export const tenantIdSchema = z
  .string()
  .min(3)
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const sessionIdSchema = z.string().uuid();
export const chatRequestSchema = z.object({
  message: z.string().trim().min(1).max(16_000),
  sessionId: sessionIdSchema.optional(),
  metadata: z
    .record(z.string(), z.string().max(512))
    .refine((v) => Object.keys(v).length <= 20, 'At most 20 metadata entries')
    .optional(),
});
export const chatResponseSchema = z.object({
  sessionId: sessionIdSchema,
  answer: z.string(),
  citations: z.array(z.object({uri: z.string().url(), title: z.string(), snippet: z.string()})),
  requestId: z.string(),
});
export const ingestRequestSchema = z.object({
  uri: z
    .string()
    .url()
    .refine((v) => v.startsWith('gs://'), 'Only gs:// URIs are accepted'),
  displayName: z.string().min(1).max(256),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatResponse = z.infer<typeof chatResponseSchema>;
export type IngestRequest = z.infer<typeof ingestRequestSchema>;

export interface Principal {
  subject: string;
  tenantId: string;
  roles: readonly string[];
}
