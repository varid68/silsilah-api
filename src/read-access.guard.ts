import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

@Injectable()
export class ReadAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.path === '/api/v1/health') return true;
    const expected = process.env.API_READ_TOKEN?.trim();
    if (!expected) return true; // Local development; production is validated at startup.
    const supplied = request.header('x-family-key') ?? '';
    const hash = (value: string) => createHash('sha256').update(value).digest();
    if (!timingSafeEqual(hash(supplied), hash(expected))) {
      throw new UnauthorizedException('Akses keluarga tidak valid.');
    }
    return true;
  }
}
