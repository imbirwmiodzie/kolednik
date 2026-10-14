import { buildApp } from './app.js';
import { loadConfig } from './config.js';

async function main() {
  const config = loadConfig();
  const { app, library } = await buildApp(config, { logger: true });

  await app.listen({ port: config.port, host: config.host });
  app.log.info(`Kolędnik: ${library.slugs.length} kolęd, dane w ${config.dataDir}`);

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      app.close().then(() => process.exit(0));
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
