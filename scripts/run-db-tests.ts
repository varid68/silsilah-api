import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { initializeDatabase, localPostgres } from './local-postgres';

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No local port');
  await new Promise<void>(done => server.close(() => done()));
  return address.port;
}
async function main() {
  const base = resolve(__dirname, '../../../.local');
  await mkdir(base, { recursive: true });
  const directory = await mkdtemp(join(base, 'pg-test-'));
  const port = await freePort();
  const pg = localPostgres(directory, port, false);
  try {
    await pg.initialise();
    await pg.start();
    const { adminUrl, readerUrl } = await initializeDatabase(pg, `silsilah_test_${process.pid}`, port);
    const env = {
      ...process.env, DATABASE_URL: readerUrl, DIRECT_URL: adminUrl,
      NODE_ENV: 'test', DATASET_ID: 'asrori', API_READ_TOKEN: '', ALLOW_TEST_DB: 'true',
    };
    const cwd = resolve(__dirname, '..');
    execFileSync(process.execPath, [resolve(cwd, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
      { cwd, env, stdio: 'inherit' });
    execFileSync(process.execPath, [resolve(cwd, 'node_modules/jest/bin/jest.js'),
      '--config', 'jest.db.config.cjs', '--runInBand'], { cwd, env, stdio: 'inherit' });
  } finally { await pg.stop(); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
