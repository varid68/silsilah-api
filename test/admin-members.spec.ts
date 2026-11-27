import 'reflect-metadata';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminMembersController } from '../src/admin-members.controller';
import { applyContactPatch, memberFilter, normalizePhone, parsePatch } from '../src/admin-member-validation';
import { ReadAccessGuard } from '../src/read-access.guard';

const phone = { phoneNumber: '+6281234567890', phoneShared: false };
const sharedPhone = { ...phone, phoneShared: true };

test('admin routes require their own server credential even without a family key', () => {
  const adminToken = 'test-admin-key-that-is-over-32-characters';
  const familyToken = 'test-family-key-that-is-over-32-characters';
  const original = process.env;
  process.env = { ...original, ADMIN_API_TOKEN: adminToken, API_READ_TOKEN: familyToken };
  const context = (headers: Record<string, string>) => ({
    getClass: () => AdminMembersController,
    getHandler: () => AdminMembersController.prototype.list,
    switchToHttp: () => ({ getRequest: () => ({ header: (key: string) => headers[key] }) }),
  }) as unknown as ExecutionContext;
  const guard = new ReadAccessGuard(new Reflector());
  try {
    expect(guard.canActivate(context({ 'x-admin-key': adminToken }))).toBe(true);
    expect(() => guard.canActivate(context({ 'x-family-key': familyToken }))).toThrow('Akses admin');
    expect(() => guard.canActivate(context({ 'x-admin-key': familyToken }))).toThrow('Akses admin');
    delete process.env.ADMIN_API_TOKEN;
    expect(() => guard.canActivate(context({}))).toThrow('Akses admin');
    process.env.ADMIN_API_TOKEN = familyToken;
    expect(() => guard.canActivate(context({ 'x-admin-key': familyToken }))).toThrow('Akses admin');
  } finally {
    process.env = original;
  }
});

test('the API validates combined filters and limits edits to contact data', () => {
  expect(memberFilter({ q: '   Siti   Nur ', generation: '3', page: '2' })).toEqual({ q: 'Siti Nur', generation: 3, page: 2 });
  expect(() => memberFilter({ generation: ['3', '4'] })).toThrow('filter tidak valid');
  expect(parsePatch({ domicileCity: 'Kota Bandung' })).toEqual({ domicileCity: 'Kota Bandung' });
  expect(parsePatch({ domicileCity: null })).toEqual({ domicileCity: null });
  expect(() => parsePatch({ domicileCity: 1 })).toThrow('Domisili tidak valid');
  expect(() => parsePatch({ name: 'Nama baru' })).toThrow('Hanya domisili');
  expect(() => parsePatch({ phoneShared: 'true' })).toThrow('Izin berbagi tidak valid');
});

test('NestJS normalizes numbers and manages consent on create, replace, revoke, and clear', () => {
  expect(normalizePhone('0812-3456-7890')).toBe(phone.phoneNumber);
  expect(() => normalizePhone('abc123')).toThrow('nomor HP yang valid');
  const empty = { phoneNumber: null, phoneShared: false };
  expect(applyContactPatch(empty, parsePatch({ phoneNumber: '081234567890' }))).toEqual(phone);
  expect(applyContactPatch(phone, { phoneShared: true })).toEqual(sharedPhone);
  expect(applyContactPatch(sharedPhone, { phoneShared: false })).toEqual(phone);
  expect(applyContactPatch(sharedPhone, { phoneNumber: '+628111111111' }))
    .toEqual({ phoneNumber: '+628111111111', phoneShared: false });
  expect(applyContactPatch(sharedPhone, { phoneNumber: null })).toEqual(empty);
  expect(() => applyContactPatch(empty, { phoneShared: true })).toThrow('Isi nomor HP');
});
