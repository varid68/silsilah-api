# Silsilah API

Deploy repo API ini dengan Render **Node Web Service**. Biarkan Root Directory kosong.

```sh
# Build Command
npm ci --include=dev && npm run db:generate && npm run build

# Start Command
npm start
```

`prebuild` membangun `@silsilah/family` dari source yang disertakan di
`packages/family/`. Folder ini adalah salinan paket bersama pada proyek Silsilah;
saat kontrak/selector diperbarui, sinkronkan `src/`, manifest, lockfile, dan tsconfig
dari paket bersama. Jangan sertakan `dist/`, `node_modules/`, atau fixture data keluarga.

Gunakan Node 22, `NODE_ENV=production`, `HOST=0.0.0.0`, `DATASET_ID=asrori`,
`API_READ_TOKEN`, dan `DATABASE_URL`/`DIRECT_URL` akun reader Supabase. Biarkan
Render menyediakan `PORT`. Health Check Path: `/api/v1/health`.

Migrasi dan impor data tidak dijalankan sebagai bagian deploy. Jangan unggah
file `.env`, URI admin, atau JSON keluarga. API membaca data dari Supabase.
