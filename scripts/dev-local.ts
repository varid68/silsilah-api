import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { normalizeSource } from '@silsilah/family/import';
import { persistImport } from './persist-import';
import { initializeDatabase, localPostgres } from './local-postgres';

async function main() {
  const directory = resolve(__dirname, '../../../.local/postgres');
  await mkdir(directory, { recursive: true });
  const port = Number(process.env.LOCAL_PG_PORT ?? 54329);
  const pg = localPostgres(directory, port, true);
  let child: ReturnType<typeof spawn> | undefined;
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    if (child?.pid) {
      try {
        if (process.platform === 'win32') child.kill('SIGTERM');
        else process.kill(-child.pid, 'SIGTERM');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
      }
    }
    await pg.stop();
  };
  process.once('SIGINT', () => { void stop(); });
  process.once('SIGTERM', () => { void stop(); });
  try {
    if (!existsSync(resolve(directory, 'PG_VERSION'))) await pg.initialise();
    await pg.start();
    const { adminUrl, readerUrl } = await initializeDatabase(pg, 'silsilah', port);
    const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: readerUrl, DIRECT_URL: adminUrl, NODE_ENV: 'development' };
    execFileSync(process.execPath, [resolve(__dirname, '../node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
      { cwd: resolve(__dirname, '..'), env, stdio: 'inherit' });
    const raw = await readFile(resolve(__dirname, '../../../data/silsilah-keluarga.json'));
    const data = normalizeSource(JSON.parse(raw.toString()), process.env.DATASET_ID ?? 'asrori');
    data.graph.dataset.checksum = createHash('sha256').update(raw).digest('hex');
    const prisma = new PrismaClient({ datasources: { db: { url: adminUrl } } });
    try { console.log(await persistImport(prisma, data)); } finally { await prisma.$disconnect(); }
    console.log(`Private development PostgreSQL on 127.0.0.1:${port}; starting API on port ${env.PORT ?? 3000}.`);
    console.log('Ctrl+C stops API + database. Data remains in .local/postgres; do not use this in production.');
    child = spawn(process.execPath, [resolve(__dirname, '../node_modules/@nestjs/cli/bin/nest.js'), 'start', '--watch'],
      {
        cwd: resolve(__dirname, '..'),
        env: { ...env, DIRECT_URL: readerUrl },
        stdio: 'inherit',
        detached: process.platform !== 'win32',
      });
    await new Promise<void>((done, reject) => {
      child!.once('exit', code => code && !stopped ? reject(new Error(`API exited: ${code}`)) : done());
      child!.once('error', reject);
    });
  } finally { await stop(); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
