import {readFile} from 'node:fs/promises';
import {parseAllDocuments} from 'yaml';

const path = new URL('../infra/ax/resources.yaml', import.meta.url);
const source = await readFile(path, 'utf8');
const resources = parseAllDocuments(source).map((document) => document.toJS());
const expectedKinds = new Set(['Workspace', 'Model', 'Task']);

if (resources.length !== expectedKinds.size) {
  throw new Error(`Expected 3 AX resources, found ${resources.length}`);
}
for (const resource of resources) {
  if (resource.apiVersion !== 'ax.io/v1alpha1') {
    throw new Error(`${resource.kind ?? 'Resource'} must use ax.io/v1alpha1`);
  }
  if (!expectedKinds.delete(resource.kind)) {
    throw new Error(`Unexpected or duplicate AX kind: ${resource.kind}`);
  }
  if (!/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(resource.metadata?.name ?? '')) {
    throw new Error(`${resource.kind} metadata.name is not RFC 1123 compatible`);
  }
  if (resource.metadata?.atespace !== 'agentic-rag') {
    throw new Error(`${resource.kind} must use the agentic-rag atespace`);
  }
}

const task = resources.find((resource) => resource.kind === 'Task');
if (task.spec?.debug !== false) throw new Error('Production AX tasks must disable debug access');
if (!String(task.spec?.image).includes('RELEASE_SHA')) {
  throw new Error('AX task images must use an immutable release substitution');
}
if (/AIza[0-9A-Za-z_-]{20,}/.test(source)) throw new Error('Possible API key in AX manifest');

console.log('Google AX manifests are structurally valid and production debug is disabled.');
