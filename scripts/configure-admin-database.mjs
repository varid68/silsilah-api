import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { PrismaClient } from '@prisma/client';

const role = 'silsilah_dashboard';
const apiFolder = new URL('../', import.meta.url);
const envFile = new URL('.env', apiFolder);
const grantsFile = new URL('./grant-database-access.sql', import.meta.url);
const connect = url => new PrismaClient({ datasources: { db: { url } } });

async function verify(uri) {
  const db = connect(uri);
  try {
    const [identity] = await db.$queryRaw`SELECT current_user AS role`;
    if (identity.role !== role) throw new Error('Koneksi dashboard harus memakai role silsilah_dashboard.');
    await db.$queryRaw`SELECT "id", "domicileCity" FROM public."Person" LIMIT 0`;
    await db.$queryRaw`SELECT "personId", "phoneNumber", "phoneShared" FROM public."PersonPrivateContact" LIMIT 0`;
    await db.$executeRaw`UPDATE public."Person" SET "domicileAdminOverride" = true WHERE false`;
    console.log('Koneksi dan izin database admin NestJS valid.');
  } finally {
    await db.$disconnect();
  }
}

async function main() {
  const apiEnv = parseEnv(await readFile(envFile, 'utf8'));
  const configured = process.env.ADMIN_DATABASE_URL || apiEnv.ADMIN_DATABASE_URL;
  if (configured) {
    await verify(configured);
    return;
  }
  if (!apiEnv.DIRECT_URL) throw new Error('DIRECT_URL belum tersedia di apps/api/.env.');
  const ownerUri = new URL(apiEnv.DIRECT_URL);
  const dashboardUri = new URL(ownerUri);
  const user = decodeURIComponent(ownerUri.username);
  if (ownerUri.hostname.endsWith('.pooler.supabase.com')) {
    const ref = user.split('.').at(-1);
    if (!user.includes('.') || !ref) throw new Error('Username Supabase pooler harus mencantumkan project ref.');
    dashboardUri.username = `${role}.${ref}`;
  } else {
    dashboardUri.username = role;
  }
  const password = randomBytes(32).toString('hex');
  dashboardUri.password = password;
  const owner = connect(ownerUri.href);
  try {
    const [state] = await owner.$queryRaw`
      SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname = ${role}) AS role_exists,
        EXISTS(SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'Person' AND column_name = 'domicileAdminOverride') AS migrated
    `;
    if (state.role_exists) {
      throw new Error('Role silsilah_dashboard sudah ada. Isi ADMIN_DATABASE_URL role tersebut di apps/api/.env, lalu jalankan kembali.');
    }
    if (!state.migrated) {
      const migrated = spawnSync(process.execPath, [
        fileURLToPath(new URL('node_modules/prisma/build/index.js', apiFolder)), 'migrate', 'deploy',
      ], { cwd: apiFolder, env: { ...process.env, ...apiEnv }, stdio: 'ignore' });
      if (migrated.status !== 0) throw new Error('Migrasi Prisma gagal. Periksa status migrasi di apps/api.');
    }
    const grants = (await readFile(grantsFile, 'utf8'))
      .replace(/^--.*$/gm, '').split(';').map(sql => sql.trim())
      .filter(sql => sql && sql !== 'BEGIN' && sql !== 'COMMIT');
    await owner.$transaction(async db => {
      // The generated hexadecimal password has no SQL string metacharacters.
      await db.$executeRawUnsafe(`CREATE ROLE silsilah_dashboard LOGIN PASSWORD '${password}'`);
      for (const sql of grants) await db.$executeRawUnsafe(sql);
    });
    await appendFile(envFile, `\nADMIN_DATABASE_URL="${dashboardUri.href}"\n`);
  } finally {
    await owner.$disconnect();
  }
  await verify(dashboardUri.href);
  console.log('Konfigurasi disimpan di apps/api/.env. Mulai ulang API NestJS.');
}

await main().catch(error => {
  const code = error.code ?? error.errorCode;
  if (code === 'P1001' || code === 'ENOTFOUND') {
    console.error('Koneksi Supabase gagal. Periksa akses ke host database.');
  } else if (code) {
    console.error(`Setup database gagal (${code}). Periksa koneksi atau izin role.`);
  } else {
    console.error(error.message);
  }
  process.exitCode = 1;
});
