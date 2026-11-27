import { Controller, Get, Header, Headers, Res, ServiceUnavailableException, StreamableFile } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import type { Response } from 'express';
import { PublicShareRoute } from './read-access.guard';

export const appSharePath = 'share';
export const assetLinksPath = '.well-known/assetlinks.json';
export const sharePreviewPath = 'share-preview.png';

const androidPackage = 'com.silsilah';
const playStoreUrl = `https://play.google.com/store/apps/details?id=${androidPackage}`;
const shareOrigin = 'https://silsilah-api.vercel.app';
const shareDescription = 'Jelajahi pohon keluarga dan kenali hubungan antargenerasi bersama Silsilah.';
const fingerprintPattern = /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/;
const shareRedirectScript = `window.location.replace(${JSON.stringify(playStoreUrl)});`;
export const shareRedirectScriptHash = `'sha256-${createHash('sha256').update(shareRedirectScript).digest('base64')}'`;

const sharePage = (isAndroid: boolean) => `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Silsilah</title>
  <meta name="description" content="${shareDescription}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="Silsilah">
  <meta property="og:description" content="${shareDescription}">
  <meta property="og:url" content="${shareOrigin}/${appSharePath}">
  <meta property="og:image" content="${shareOrigin}/${sharePreviewPath}">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:width" content="1024">
  <meta property="og:image:height" content="1024">
  <meta property="og:image:alt" content="Ikon aplikasi Silsilah">
  <style>
    body { margin: 0; padding: 2rem 1rem; font: 1rem/1.5 system-ui, sans-serif; color: #173d31; background: #f4f8f5; }
    main { max-width: 32rem; margin: 10vh auto 0; }
    a { display: inline-block; padding: 0.75rem 1rem; border-radius: 0.5rem; color: white; background: #173d31; }
  </style>
</head>
<body>
  <main>
    <h1>Silsilah</h1>
    <p>Unduh Silsilah untuk menjelajahi pohon keluarga.</p>
    <a href="${playStoreUrl}">Buka Google Play</a>
  </main>
  ${isAndroid ? `<script>${shareRedirectScript}</script>` : ''}
</body>
</html>`;

@Controller()
export class AppShareController {
  @Get(appSharePath)
  @PublicShareRoute(true)
  @Header('Cache-Control', 'no-store')
  @Header('Content-Type', 'text/html; charset=utf-8')
  share(@Headers('user-agent') userAgent: string | undefined, @Res({ passthrough: true }) response: Response) {
    response.vary('User-Agent');
    return sharePage(/\bAndroid\b/i.test(userAgent ?? ''));
  }

  @Get(sharePreviewPath)
  @PublicShareRoute(true)
  @Header('Cache-Control', 'public, max-age=3600')
  @Header('Cross-Origin-Resource-Policy', 'cross-origin')
  sharePreview() {
    return new StreamableFile(createReadStream(join(__dirname, 'assets/share-preview.png')), {
      type: 'image/png',
    });
  }

  @Get(assetLinksPath)
  @PublicShareRoute(true)
  @Header('Content-Type', 'application/json')
  assetLinks() {
    const fingerprints = (process.env.ANDROID_APP_LINK_SHA256_FINGERPRINTS ?? '')
      .split(',')
      .map(value => value.trim().toUpperCase());
    if (fingerprints.some(value => !fingerprintPattern.test(value))) {
      throw new ServiceUnavailableException('Android App Links signing fingerprints are not configured.');
    }

    return [{
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: androidPackage,
        sha256_cert_fingerprints: [...new Set(fingerprints)],
      },
    }];
  }
}
