import { adminCredentials } from './admin/admin.js';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';

async function main() {
  const config = loadConfig();
  // Tylko ostrzeżenia i błędy — zwykłe komunikaty wypisujemy po ludzku poniżej.
  const { app, library } = await buildApp(config, { logger: true, logLevel: 'warn' });

  await app.listen({ port: config.port, host: config.host });
  console.log(
    `Kolędnik działa na porcie ${config.port}: ${library.slugs.length} kolęd, dane w ${config.dataDir}`,
  );

  if (adminCredentials().isDefault) {
    console.warn(
      'Uwaga: panel /admin używa domyślnego hasła — ustaw ADMIN_USER i ADMIN_PASSWORD na serwerze.',
    );
  }

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
