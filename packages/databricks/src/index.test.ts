import {describe, expect, it, vi} from 'vitest';
import {DatabricksClient} from './index.js';

const options = {
  host: 'https://workspace.gcp.databricks.com',
  clientId: 'client',
  clientSecret: 'secret-value',
  warehouseId: 'warehouse',
  vectorIndex: 'main.knowledge.documents_index',
  vectorColumns: ['id', 'title', 'content', 'source_uri', 'tenant_id'],
  allowedViews: ['main.agent.customer_summary'],
};

const json = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), {status, headers: {'content-type': 'application/json'}});
const bodyAt = (fetcher: ReturnType<typeof vi.fn<typeof fetch>>, index: number): string => {
  const body = fetcher.mock.calls[index]?.[1]?.body;
  if (typeof body !== 'string') throw new Error('Expected JSON request body');
  return body;
};

describe('DatabricksClient', () => {
  it('enforces tenant filter on vector search and reuses OAuth token', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({access_token: 'token', expires_in: 3600}))
      .mockResolvedValueOnce(
        json({
          manifest: {
            columns: [{name: 'id'}, {name: 'title'}, {name: 'content'}, {name: 'source_uri'}],
          },
          result: {data_array: [['1', 'Policy', 'Text', 'dbx://doc/1']]},
        }),
      )
      .mockResolvedValueOnce(json({manifest: {columns: []}, result: {data_array: []}}));
    const client = new DatabricksClient(options, fetcher);
    await client.semanticSearch('leave policy', 'tenant-a');
    await client.semanticSearch('holiday policy', 'tenant-a');
    expect(fetcher).toHaveBeenCalledTimes(3);
    const request = JSON.parse(bodyAt(fetcher, 1)) as {filters_json: string};
    expect(JSON.parse(request.filters_json)).toEqual({tenant_id: 'tenant-a'});
  });

  it('compiles structured access with mandatory tenant parameter', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({access_token: 'token', expires_in: 3600}))
      .mockResolvedValueOnce(
        json({
          statement_id: 's1',
          status: {state: 'SUCCEEDED'},
          manifest: {schema: {columns: [{name: 'customer_id'}]}},
          result: {data_array: [['c1']], truncated: false},
        }),
      );
    const client = new DatabricksClient(options, fetcher);
    await client.queryView('main.agent.customer_summary', 'tenant-a', {region: 'IN'}, [
      'customer_id',
    ]);
    const request = JSON.parse(bodyAt(fetcher, 1)) as {
      statement: string;
      parameters: {name: string; value: string}[];
    };
    expect(request.statement).toContain('WHERE tenant_id = :tenant_id');
    expect(request.parameters).toContainEqual({
      name: 'tenant_id',
      value: 'tenant-a',
      type: 'STRING',
    });
    expect(request.statement).not.toContain('tenant-a');
  });

  it('rejects non-allowlisted views and unsafe identifiers', async () => {
    const client = new DatabricksClient(options, vi.fn<typeof fetch>());
    await expect(client.queryView('main.private.secrets', 'tenant-a')).rejects.toThrow(
      'allowlisted',
    );
    await expect(
      client.queryView('main.agent.customer_summary', 'tenant-a', {'x OR 1=1': 'a'}),
    ).rejects.toThrow('Invalid filters');
  });
});
