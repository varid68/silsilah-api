import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { readConfig } from './config';
import { setupApp } from './setup';

async function bootstrap() {
  const config = readConfig();
  const app = await NestFactory.create(AppModule);
  setupApp(app, config.corsOrigins);
  await app.listen(config.port, config.host);
  console.log(`Silsilah API listening on ${config.host}:${config.port}/api/v1`);
}
void bootstrap().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
