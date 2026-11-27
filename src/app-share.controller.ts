import { Controller, Get, Header, Headers, Res, ServiceUnavailableException } from '@nestjs/common';
import type { Response } from 'express';
import { PublicShareRoute } from './read-access.guard';

export const appSharePath = 'share';
export const assetLinksPath = '.well-known/assetlinks.json';

const androidPackage = 'com.silsilah';
const playStoreUrl = `https://play.google.com/store/apps/details?id=${androidPackage}`;
const fingerprintPattern = /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/;

const sharePage = `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Silsilah</title>
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
    if (/\bAndroid\b/i.test(userAgent ?? '')) {
      response.status(302).location(playStoreUrl);
      return '';
    }
    return sharePage;
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
