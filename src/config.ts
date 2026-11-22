import 'dotenv/config';

export function readConfig(env = process.env) {
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  const production = env.NODE_ENV === 'production';
  const apiReadToken = env.API_READ_TOKEN?.trim() ?? '';
  if (production && apiReadToken.length < 32) {
    throw new Error('Production requires API_READ_TOKEN with at least 32 characters');
  }
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required; see .env.example');
  return {
    port, production, apiReadToken,
    host: env.HOST ?? '0.0.0.0',
    datasetId: env.DATASET_ID ?? 'asrori',
    corsOrigins: (env.CORS_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean),
  };
}
