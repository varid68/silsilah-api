import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppShareController } from './app-share.controller';
import { FamilyController } from './family.controller';
import { FamilyService } from './family.service';
import { HealthController } from './health.controller';
import { PrismaService } from './prisma.service';
import { ReadAccessGuard } from './read-access.guard';

@Module({
  controllers: [AppShareController, FamilyController, HealthController],
  providers: [PrismaService, FamilyService, { provide: APP_GUARD, useClass: ReadAccessGuard }],
})
export class AppModule {}
