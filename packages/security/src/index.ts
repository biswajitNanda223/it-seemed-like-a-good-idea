import {createRemoteJWKSet, jwtVerify} from 'jose';
import type {Principal} from '@platform/contracts';
import {z} from 'zod';

const claimsSchema = z.object({
  sub: z.string().min(1),
  tenant_id: z.string().min(3).max(64),
  roles: z.array(z.string()).default([]),
});

export class JwtAuthenticator {
  readonly #jwks;
  constructor(
    private readonly issuer: string,
    private readonly audience: string,
  ) {
    this.#jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  }
  async authenticate(authorization?: string): Promise<Principal> {
    if (!authorization?.startsWith('Bearer ')) throw new Error('Missing bearer token');
    const {payload} = await jwtVerify(authorization.slice(7), this.#jwks, {
      issuer: this.issuer,
      audience: this.audience,
      algorithms: ['RS256'],
    });
    const claims = claimsSchema.parse(payload);
    return {subject: claims.sub, tenantId: claims.tenant_id, roles: claims.roles};
  }
}

const injectionSignals = [
  /ignore (all|any|the) previous instructions/i,
  /reveal (the )?(system|developer) prompt/i,
  /exfiltrat(e|ion)/i,
  /print .*secret/i,
];

export interface GuardrailResult {
  allowed: boolean;
  reason?: string;
}
export const inspectUserInput = (input: string): GuardrailResult => {
  if (input.includes('\0')) return {allowed: false, reason: 'invalid_character'};
  if (injectionSignals.some((signal) => signal.test(input)))
    return {allowed: false, reason: 'prompt_injection'};
  return {allowed: true};
};

export const sanitizeForLogs = (value: string): string =>
  value
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[EMAIL]')
    .replace(/Bearer\s+[\w.-]+/gi, 'Bearer [REDACTED]');
