import {z} from 'zod';

export interface DatabricksOptions {
  host: string;
  clientId: string;
  clientSecret: string;
  warehouseId: string;
  vectorIndex: string;
  vectorColumns: readonly string[];
  allowedViews: readonly string[];
  timeoutMs?: number;
  maxRows?: number;
  maxBytes?: number;
}

export interface SemanticHit {
  id: string;
  title: string;
  content: string;
  sourceUri: string;
  score?: number;
}

export interface StructuredResult {
  columns: readonly string[];
  rows: readonly (readonly unknown[])[];
  truncated: boolean;
  statementId: string;
}

export interface DatabricksRetrievalPort {
  semanticSearch(query: string, tenantId: string, limit?: number): Promise<readonly SemanticHit[]>;
  queryView(
    view: string,
    tenantId: string,
    filters?: Readonly<Record<string, string>>,
    columns?: readonly string[],
  ): Promise<StructuredResult>;
}

type FetchLike = typeof fetch;
const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;
const qualifiedIdentifier = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*){2}$/;
const tokenSchema = z.object({access_token: z.string(), expires_in: z.coerce.number().positive()});

export class DatabricksClient implements DatabricksRetrievalPort {
  readonly #host: string;
  readonly #timeoutMs: number;
  readonly #maxRows: number;
  readonly #maxBytes: number;
  readonly #allowedViews: Set<string>;
  readonly #fetch: FetchLike;
  #token?: {value: string; expiresAt: number};

  constructor(
    private readonly options: DatabricksOptions,
    fetcher: FetchLike = fetch,
  ) {
    this.#host = options.host.replace(/\/$/, '');
    this.#timeoutMs = options.timeoutMs ?? 15_000;
    this.#maxRows = Math.min(options.maxRows ?? 100, 1000);
    this.#maxBytes = Math.min(options.maxBytes ?? 1_000_000, 5_000_000);
    this.#allowedViews = new Set(options.allowedViews);
    this.#fetch = fetcher;
    if (!qualifiedIdentifier.test(options.vectorIndex))
      throw new Error('Invalid Databricks vector index');
    if (options.vectorColumns.some((column) => !identifier.test(column)))
      throw new Error('Invalid vector column');
    if (options.allowedViews.some((view) => !qualifiedIdentifier.test(view)))
      throw new Error('Invalid allowed view');
  }

  async semanticSearch(
    query: string,
    tenantId: string,
    limit = 8,
  ): Promise<readonly SemanticHit[]> {
    const response = await this.#request(
      `/api/2.0/vector-search/indexes/${encodeURIComponent(this.options.vectorIndex)}/query`,
      {
        columns: this.options.vectorColumns,
        query_text: query,
        query_type: 'HYBRID',
        num_results: Math.min(Math.max(limit, 1), 20),
        filters_json: JSON.stringify({tenant_id: tenantId}),
        score_threshold: 0.25,
      },
    );
    const parsed = vectorResponseSchema.parse(response);
    const columns = parsed.manifest.columns.map((column) => column.name);
    const at = (row: readonly unknown[], name: string): unknown => row[columns.indexOf(name)];
    return parsed.result.data_array.map((row) => ({
      id: asString(at(row, 'id')),
      title: asString(at(row, 'title')),
      content: asString(at(row, 'content')),
      sourceUri: asString(at(row, 'source_uri')),
      ...(typeof row.at(-1) === 'number' ? {score: row.at(-1) as number} : {}),
    }));
  }

  async queryView(
    view: string,
    tenantId: string,
    filters: Readonly<Record<string, string>> = {},
    columns: readonly string[] = ['*'],
  ): Promise<StructuredResult> {
    if (!this.#allowedViews.has(view)) throw new Error('View is not allowlisted');
    if (columns.length > 20 || columns.some((column) => column !== '*' && !identifier.test(column)))
      throw new Error('Invalid projection');
    const entries = Object.entries(filters);
    if (
      entries.length > 10 ||
      entries.some(([key]) => !identifier.test(key) || key === 'tenant_id')
    )
      throw new Error('Invalid filters');
    const projection = columns[0] === '*' ? '*' : columns.map(quoteIdentifier).join(', ');
    const where = [
      'tenant_id = :tenant_id',
      ...entries.map(([key], index) => `${quoteIdentifier(key)} = :filter_${index}`),
    ];
    const parameters = [
      {name: 'tenant_id', value: tenantId, type: 'STRING'},
      ...entries.map(([, value], index) => ({name: `filter_${index}`, value, type: 'STRING'})),
    ];
    const response = await this.#request('/api/2.0/sql/statements/', {
      warehouse_id: this.options.warehouseId,
      statement: `SELECT ${projection} FROM ${quoteQualifiedIdentifier(view)} WHERE ${where.join(' AND ')}`,
      parameters,
      disposition: 'INLINE',
      format: 'JSON_ARRAY',
      wait_timeout: '15s',
      on_wait_timeout: 'CANCEL',
      row_limit: this.#maxRows,
      byte_limit: this.#maxBytes,
    });
    const parsed = statementResponseSchema.parse(response);
    if (parsed.status.state !== 'SUCCEEDED')
      throw new Error(`Databricks statement ${parsed.status.state}`);
    return {
      columns: parsed.manifest?.schema?.columns?.map((column) => column.name) ?? [],
      rows: parsed.result?.data_array ?? [],
      truncated: parsed.result?.truncated ?? false,
      statementId: parsed.statement_id,
    };
  }

  async #request(path: string, body: unknown): Promise<unknown> {
    const token = await this.#accessToken();
    const response = await this.#fetch(`${this.#host}${path}`, {
      method: 'POST',
      headers: {authorization: `Bearer ${token}`, 'content-type': 'application/json'},
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.#timeoutMs),
    });
    if (!response.ok) throw new Error(`Databricks API failed (${response.status})`);
    return response.json();
  }

  async #accessToken(): Promise<string> {
    if (this.#token && this.#token.expiresAt > Date.now() + 60_000) return this.#token.value;
    const credentials = Buffer.from(
      `${this.options.clientId}:${this.options.clientSecret}`,
    ).toString('base64');
    const response = await this.#fetch(`${this.#host}/oidc/v1/token`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${credentials}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({grant_type: 'client_credentials', scope: 'all-apis'}),
      signal: AbortSignal.timeout(this.#timeoutMs),
    });
    if (!response.ok) throw new Error(`Databricks OAuth failed (${response.status})`);
    const token = tokenSchema.parse(await response.json());
    this.#token = {value: token.access_token, expiresAt: Date.now() + token.expires_in * 1000};
    return token.access_token;
  }
}

const quoteIdentifier = (value: string): string => `\`${value}\``;
const quoteQualifiedIdentifier = (value: string): string =>
  value.split('.').map(quoteIdentifier).join('.');
const asString = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : '';
const vectorResponseSchema = z.object({
  manifest: z.object({columns: z.array(z.object({name: z.string()}))}),
  result: z.object({data_array: z.array(z.array(z.unknown()))}),
});
const statementResponseSchema = z.object({
  statement_id: z.string(),
  status: z.object({state: z.string()}),
  manifest: z
    .object({schema: z.object({columns: z.array(z.object({name: z.string()}))})})
    .optional(),
  result: z
    .object({
      data_array: z.array(z.array(z.unknown())).optional(),
      truncated: z.boolean().optional(),
    })
    .optional(),
});
