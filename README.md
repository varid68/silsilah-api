# Silsilah API

Deploy repo API ini dengan Render **Node Web Service**. Biarkan Root Directory kosong.

```sh
# Build Command
npm ci --include=dev && npm run build

# Start Command
npm start
```

`prebuild` menghasilkan Prisma Client dari `prisma/schema.prisma` dan membangun
`@silsilah/family` dari source yang disertakan di
`packages/family/`. Folder ini adalah salinan paket bersama pada proyek Silsilah;
saat kontrak/selector diperbarui, sinkronkan `src/`, manifest, lockfile, dan tsconfig
dari paket bersama. Jangan sertakan `dist/`, `node_modules/`, atau fixture data keluarga.

Gunakan Node 22, `NODE_ENV=production`, `HOST=0.0.0.0`, `DATASET_ID=asrori`,
`API_READ_TOKEN`, dan `DATABASE_URL`/`DIRECT_URL` akun reader Supabase. Biarkan
Render menyediakan `PORT`. Health Check Path: `/api/v1/health`.

Migrasi dan impor data tidak dijalankan sebagai bagian deploy. Jangan unggah
file `.env`, URI admin, atau JSON keluarga. API membaca data dari Supabase.

## Nomor HP yang dibagikan

Terapkan migrasi sebelum merilis versi API yang menyediakan
`GET /api/v1/members/:personId/phone`. Endpoint memakai kunci baca keluarga yang
sama dengan endpoint data lainnya dan tidak memerlukan akun per anggota. Tanpa
izin berbagi, API mengembalikan `{"phoneNumber":null}`. Respons tidak di-cache.
Nomor tidak ikut di respons pohon atau daftar anggota.

Aktifkan `PersonPrivateContact.phoneShared` hanya jika pemilik nomor menyetujui
akses bagi seluruh pengguna aplikasi. Role runtime `silsilah_reader` hanya perlu
`SELECT` pada view `SharedPersonPhone`, bukan tabel `PersonPrivateContact`.
Jika nama role berbeda, atau role dibuat setelah migrasi, berikan `SELECT` pada
view itu secara terpisah. Jangan mengekspos skema keluarga ke Data API Supabase.
