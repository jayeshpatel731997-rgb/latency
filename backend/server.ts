import 'dotenv/config';

import { createAccessTokenVerifier } from './auth';
import { createApp } from './app';
import { loadConfig } from './config';
import { createDatabase } from './db';
import { logger } from './logger';

const config = loadConfig();
const database = createDatabase(config);
const app = createApp(config, {
  database,
  logger,
  verifyAccessToken: createAccessTokenVerifier(config),
});

const server = app.listen(config.port, config.host, () => {
  logger.info('server_started', {
    environment: config.appEnvironment,
    host: config.host,
    port: config.port,
  });
});

function shutdown(signal: string): void {
  logger.info('server_stopping', { signal });
  server.close((error) => {
    if (error) {
      logger.error('server_stop_failed', { error: String(error) });
      process.exitCode = 1;
    }
  });
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
