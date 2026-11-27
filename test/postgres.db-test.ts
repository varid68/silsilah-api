import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { normalizeSource } from '@silsilah/family/import';
import { persistImport } from '../scripts/persist-import';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup';

const source = JSON.parse(readFileSync(resolve(__dirname, '../../../data/silsilah-keluarga.json'), 'utf8'));
function data(input = source) {
  const normalized = normalizeSource(input);
  normalized.graph.dataset.checksum = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  return normalized;
}
describe('Real PostgreSQL import + read-only Prisma + Nest HTTP', () => {
  let admin: PrismaClient;
  let app: INestApplication;
  beforeAll(async () => {
    if (process.env.ALLOW_TEST_DB !== 'true' || !process.env.DIRECT_URL?.includes('/silsilah_test_')) {
      throw new Error('Run npm run test:integration; do not point tests at a real family database.');
    }
    admin = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
    await persistImport(admin, data());
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    setupApp(app);
    await app.init();
  });
  afterAll(async () => { await app?.close(); await admin?.$disconnect(); });
  test('migration and import persist 246 distinct people', async () => {
    expect(await admin.person.count({ where: { active: true } })).toBe(246);
    const { body } = await request(app.getHttpServer()).get('/api/v1/family').expect(200);
    expect(body.generationCounts).toEqual({ 1: 2, 2: 9, 3: 56, 4: 124 });
  });
  test('identical import is a no-op; force re-import is also duplicate-safe', async () => {
    expect((await persistImport(admin, data())).status).toBe('unchanged');
    expect((await persistImport(admin, data(), true)).status).toBe('imported');
    expect(await admin.person.count()).toBe(246);
  });
  test('re-import preserves dashboard domisili changes, including an explicit empty value', async () => {
    const [first, second, third] = data().graph.people;
    const ids = [first.id, second.id, third.id];
    await admin.person.update({
      where: { id: first.id }, data: { domicileCity: 'Kota Bandung', domicileAdminOverride: true },
    });
    await admin.person.update({
      where: { id: second.id }, data: { domicileCity: null, domicileAdminOverride: true },
    });
    try {
      const fresh = data();
      for (const person of fresh.graph.people) {
        if (ids.includes(person.id)) person.domicileCity = 'Kota Surabaya';
      }
      await persistImport(admin, fresh, true);
      const rows = await admin.person.findMany({
        where: { id: { in: ids } }, select: { id: true, domicileCity: true },
      });
      const cities = new Map(rows.map(row => [row.id, row.domicileCity]));
      expect(ids.map(id => cities.get(id))).toEqual(['Kota Bandung', null, 'Kota Surabaya']);
    } finally {
      await admin.person.updateMany({ where: { id: { in: ids } }, data: { domicileAdminOverride: false } });
      await persistImport(admin, data(), true);
    }
  });
  test('API searches two Zaenuris without merging and focuses Inafah correctly', async () => {
    const search = await request(app.getHttpServer()).get('/api/v1/members?q=Zaenuri').expect(200);
    expect(search.body.total).toBe(2);
    const inafah = data().graph.people.find(p => p.name === 'Inafah')!;
    const result = await request(app.getHttpServer()).get(`/api/v1/tree/${inafah.id}`).expect(200);
    expect(result.body.children.map((p: { name: string }) => p.name)).toEqual(['Farida Khasna', 'Farid Tanwir']);
    expect(result.body.partners[0].branchId).toBe('asrori-branch-2');
    expect(result.body.descendantCounts).toEqual({ 1: 2 });
  });
  test('focus API exposes relative generations and separate source spouse groups', async () => {
    const root = await request(app.getHttpServer()).get('/api/v1/tree/asrori-person-root-husband').expect(200);
    expect(root.body.descendantCounts).toEqual({ 1: 9, 2: 56, 3: 124 });
    expect(root.body.descendantCount).toBe(189);
    const muhith = await request(app.getHttpServer()).get('/api/v1/tree/asrori-person-f4-anchor').expect(200);
    expect(muhith.body.groups.map((g: { children: unknown[] }) => g.children.length)).toEqual([7, 2]);
    expect(muhith.body.groups[0].partners.map((p: { name: string }) => p.name))
      .toEqual(['Abdul Muhith (Alm)', 'Chulailah (Almh)']);
    expect(muhith.body.groups[1].partners.map((p: { name: string }) => p.name))
      .toEqual(['Abdul Muhith (Alm)', "Munti'ah"]);
    const muhajir = data().graph.people.find(p => p.name === 'Muhajir')!;
    const unknown = await request(app.getHttpServer()).get(`/api/v1/tree/${muhajir.id}`).expect(200);
    expect(unknown.body.groups.map((g: { children: unknown[] }) => g.children.length)).toEqual([0, 0, 4]);
    expect(unknown.body.groups[2].partners).toHaveLength(1);
  });
  test('database runtime credentials cannot write, independent of HTTP routing', async () => {
    const runtime = new PrismaClient();
    try {
      await expect(runtime.$executeRawUnsafe('UPDATE "Person" SET name = name WHERE false')).rejects.toThrow();
    } finally { await runtime.$disconnect(); }
  });
  test('member phone respects opt-in changes without leaking into tree or member payloads', async () => {
    const personId = data().graph.people.find(p => p.role === 'MEMBER')!.id;
    const phoneNumber = '+12025550142';
    const path = `/api/v1/members/${encodeURIComponent(personId)}`;
    await admin.personPrivateContact.create({ data: { personId, phoneNumber } });
    await request(app.getHttpServer()).get(`${path}/phone`).expect(200, { phoneNumber: null });
    await admin.personPrivateContact.update({ where: { personId }, data: { phoneShared: true } });
    await request(app.getHttpServer()).get(`${path}/phone`).expect(200, { phoneNumber });
    for (const endpoint of [path, '/api/v1/tree', '/api/v1/members']) {
      const response = await request(app.getHttpServer()).get(endpoint).expect(200);
      expect(response.text).not.toContain('phoneNumber');
      expect(response.text).not.toContain(phoneNumber);
    }
    const runtime = new PrismaClient();
    try {
      await expect(runtime.personPrivateContact.findMany()).rejects.toThrow();
    } finally {
      await runtime.$disconnect();
    }
    await admin.person.update({ where: { id: personId }, data: { active: false } });
    await request(app.getHttpServer()).get(`${path}/phone`).expect(200, { phoneNumber: null });
    await admin.person.update({ where: { id: personId }, data: { active: true } });
    await admin.personPrivateContact.update({ where: { personId }, data: { phoneShared: false } });
    await request(app.getHttpServer()).get(`${path}/phone`).expect(200, { phoneNumber: null });
  });
  test('a corrected source preserves identity, archives removed rows, and retains manual additions', async () => {
    const inafah = data().graph.people.find(p => p.name === 'Inafah')!;
    const missing = data().graph.people.find(p => p.name === 'Farid Tanwir')!;
    await admin.person.create({ data: {
      id: 'manual-person', datasetId: 'asrori', name: 'Manual record', searchName: 'manual record',
      generation: 5, role: 'MEMBER', sourcePath: '/manual', source: {}, annotations: [],
    } });
    const changed = structuredClone(source);
    changed.families[1].children[1].name = 'Inafah (koreksi sumber)';
    changed.families[1].children[1].children.pop();
    await persistImport(admin, data(changed));
    expect((await admin.person.findUniqueOrThrow({ where: { id: inafah.id } })).name).toBe('Inafah (koreksi sumber)');
    expect((await admin.person.findUniqueOrThrow({ where: { id: missing.id } })).active).toBe(false);
    expect((await admin.person.findUniqueOrThrow({ where: { id: 'manual-person' } })).active).toBe(true);
    await persistImport(admin, data());
    expect(await admin.person.count({ where: { active: true } })).toBe(247);
  });
});
