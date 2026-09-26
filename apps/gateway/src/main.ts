import {buildApp} from './app.js';
import {getConfig} from '@platform/config';

const app = await buildApp();
const config = getConfig();
await app.listen({host: '0.0.0.0', port: config.PORT});

const shutdown = async (): Promise<void> => {
  await app.close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
