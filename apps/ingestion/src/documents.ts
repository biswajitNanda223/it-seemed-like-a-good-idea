import {database} from '@platform/database';
import type {IngestRequest} from '@platform/contracts';

export const registerDocument = async (tenantId: string, input: IngestRequest) =>
  database.document.upsert({
    where: {tenantId_sourceUri: {tenantId, sourceUri: input.uri}},
    update: {displayName: input.displayName, status: 'PENDING', error: null},
    create: {tenantId, sourceUri: input.uri, displayName: input.displayName},
  });
