import { INestApplication, RequestMethod, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { appSharePath, assetLinksPath, sharePreviewPath, shareRedirectScriptHash } from './app-share.controller';

export function setupApp(app: INestApplication, corsOrigins: string[] = []) {
  app.setGlobalPrefix('api/v1', {
    exclude: [appSharePath, assetLinksPath, sharePreviewPath].map(path => ({ path, method: RequestMethod.GET })),
  });
  app.use(helmet());
  app.use(`/${appSharePath}`, helmet.contentSecurityPolicy({
    directives: { scriptSrc: ["'self'", shareRedirectScriptHash] },
  }));
  app.enableCors({ origin: corsOrigins.length ? corsOrigins : false, methods: ['GET'] });
  app.useGlobalPipes(new ValidationPipe({
    transform: true, whitelist: true, forbidNonWhitelisted: true,
  }));
  app.enableShutdownHooks();
}
