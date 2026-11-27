import { INestApplication, RequestMethod, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { appSharePath, assetLinksPath } from './app-share.controller';

export function setupApp(app: INestApplication, corsOrigins: string[] = []) {
  app.setGlobalPrefix('api/v1', {
    exclude: [appSharePath, assetLinksPath].map(path => ({ path, method: RequestMethod.GET })),
  });
  app.use(helmet());
  app.enableCors({ origin: corsOrigins.length ? corsOrigins : false, methods: ['GET'] });
  app.useGlobalPipes(new ValidationPipe({
    transform: true, whitelist: true, forbidNonWhitelisted: true,
  }));
  app.enableShutdownHooks();
}
