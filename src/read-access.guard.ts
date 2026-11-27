import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

export const PublicShareRoute = Reflector.createDecorator<boolean>();
export const AdminRoute = Reflector.createDecorator<boolean>();
const hash = (value: string) => createHash('sha256').update(value).digest();

@Injectable()
export class ReadAccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.reflector.get(PublicShareRoute, context.getHandler())) return true;
    const request = context.switchToHttp().getRequest<Request>();
    if (this.reflector.get(AdminRoute, context.getClass())) {
      const token = process.env.ADMIN_API_TOKEN?.trim() ?? '';
      if (token.length >= 32 && token !== process.env.API_READ_TOKEN?.trim() &&
          timingSafeEqual(hash(request.header('x-admin-key') ?? ''), hash(token))) return true;
      throw new UnauthorizedException('Akses admin tidak valid.');
    }
    if (request.path === '/api/v1/health') return true;
    const expected = process.env.API_READ_TOKEN?.trim();
    if (!expected) return true; // Local development; production is validated at startup.
    const supplied = request.header('x-family-key') ?? '';
    if (!timingSafeEqual(hash(supplied), hash(expected))) {
      throw new UnauthorizedException('Akses keluarga tidak valid.');
    }
    return true;
  }
}
