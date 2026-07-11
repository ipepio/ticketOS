import { loadConfig } from './config.js';
import { initApp, shutdownApp } from './app.js';

async function main(): Promise<void> {
  const config = loadConfig();

  const { app } = await initApp(config);

  const host = config.HOST;
  const port = config.PORT;

  try {
    await app.listen({ host, port });
    app.log.info(`ticketOS listening on http://${host}:${port}`);
  } catch (err) {
    app.log.error({ err }, 'Failed to start server');
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (): Promise<void> => {
    app.log.info('Shutting down...');
    await shutdownApp(app);
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
