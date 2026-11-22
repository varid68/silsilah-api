import EmbeddedPostgres from 'embedded-postgres';

export function localPostgres(databaseDir: string, port: number, persistent: boolean) {
  return new EmbeddedPostgres({
    databaseDir, port, persistent,
    user: 'silsilah', password: 'local-development-only',
    authMethod: 'scram-sha-256',
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    postgresFlags: ['-h', '127.0.0.1', '-c', 'max_connections=30'],
    onLog: () => {}, onError: message => console.error(message),
  });
}

export async function initializeDatabase(pg: EmbeddedPostgres, database: string, port: number) {
  const client = pg.getPgClient();
  await client.connect();
  try {
    const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
    if (!existing.rowCount) await pg.createDatabase(database);
    const reader = await client.query("SELECT 1 FROM pg_roles WHERE rolname = 'silsilah_reader'");
    if (!reader.rowCount) await client.query("CREATE ROLE silsilah_reader LOGIN PASSWORD 'local-reader-only'");
  } finally { await client.end(); }
  const url = `postgresql://silsilah:local-development-only@127.0.0.1:${port}/${database}`;
  const readerUrl = `postgresql://silsilah_reader:local-reader-only@127.0.0.1:${port}/${database}`;
  const db = pg.getPgClient(database);
  await db.connect();
  try {
    await db.query('GRANT USAGE ON SCHEMA public TO silsilah_reader');
    await db.query('GRANT SELECT ON ALL TABLES IN SCHEMA public TO silsilah_reader');
    await db.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO silsilah_reader');
  } finally { await db.end(); }
  return { adminUrl: `${url}?schema=public&connection_limit=5`, readerUrl: `${readerUrl}?schema=public&connection_limit=5` };
}
