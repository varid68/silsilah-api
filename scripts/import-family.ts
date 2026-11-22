import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { normalizeSource } from '@silsilah/family/import';
import { summarize } from '@silsilah/family';
import { persistImport } from './persist-import';

async function main() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file') { i++; if (!args[i]) throw new Error('--file needs a path'); }
    else if (!['--apply', '--force'].includes(args[i])) throw new Error(`Unknown argument: ${args[i]}`);
  }
  const fileIndex = args.indexOf('--file');
  const path = fileIndex >= 0
    ? resolve(args[fileIndex + 1])
    : resolve(__dirname, '../../../data/silsilah-keluarga.json');
  const raw = await readFile(path);
  const normalized = normalizeSource(JSON.parse(raw.toString('utf8')), process.env.DATASET_ID ?? 'asrori');
  normalized.graph.dataset.checksum = createHash('sha256').update(raw).digest('hex');
  console.log(JSON.stringify({
    mode: args.includes('--apply') ? 'APPLY' : 'DRY RUN (no database writes)',
    file: path, summary: summarize(normalized.graph), warnings: normalized.warnings,
  }, null, 2));
  if (!args.includes('--apply')) return;
  const url = process.env.DIRECT_URL;
  if (!url) throw new Error('DIRECT_URL is required for administrative imports');
  const timeout = Number(process.env.IMPORT_TRANSACTION_TIMEOUT_MS ?? 300_000);
  if (!Number.isSafeInteger(timeout) || timeout < 1_000 || timeout > 900_000) {
    throw new Error('IMPORT_TRANSACTION_TIMEOUT_MS must be an integer between 1000 and 900000');
  }
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const result = await persistImport(prisma, normalized, args.includes('--force'), timeout);
    console.log(result);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'P2028') {
      console.error(`Import transaction closed (timeout configured: ${timeout} ms). Check DIRECT_URL uses direct or Session pooler and verify the target before retrying.`);
    }
    throw error;
  } finally { await prisma.$disconnect(); }
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
