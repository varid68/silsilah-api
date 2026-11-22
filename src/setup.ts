import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';

export function setupApp(app: INestApplication, corsOrigins: string[] = []) {
  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  app.enableCors({ origin: corsOrigins.length ? corsOrigins : false, methods: ['GET'] });
  app.useGlobalPipes(new ValidationPipe({
    transform: true, whitelist: true, forbidNonWhitelisted: true,
  }));
  app.enableShutdownHooks();
}
