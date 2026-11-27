import 'reflect-metadata';
import { NotFoundException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { focusPerson, members, summarize } from '@silsilah/family';
import { normalizeSource } from '@silsilah/family/import';
import { AppModule } from '../src/app.module';
import { FamilyService } from '../src/family.service';
import { PrismaService } from '../src/prisma.service';
import { readConfig } from '../src/config';
import { setupApp } from '../src/setup';

const graph = normalizeSource(JSON.parse(readFileSync(resolve(__dirname, '../../../data/silsilah-keluarga.json'), 'utf8'))).graph;
const sharedExamplePhone = '+12025550142';
describe('Read-only HTTP API', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService).useValue({ $queryRaw: async () => [{ ok: 1 }] })
      .overrideProvider(FamilyService).useValue({
        summary: () => summarize(graph),
        graph: () => graph,
        list: (query: object) => members(graph, query),
        sharedPhone: (id: string) => ({ phoneNumber: id === 'example-shared' ? sharedExamplePhone : null }),
        focus: (id: string) => {
          const result = focusPerson(graph, id);
          if (!result) throw new NotFoundException();
          return result;
        },
      }).compile();
    app = module.createNestApplication();
    setupApp(app);
    await app.init();
  });
  afterAll(async () => { delete process.env.API_READ_TOKEN; await app.close(); });

  describe('public app share links', () => {
    const playStoreUrl = 'https://play.google.com/store/apps/details?id=com.silsilah';
    const fingerprint = Array<string>(32).fill('AB').join(':');

    beforeEach(() => {
      jest.replaceProperty(process, 'env', {
        ...process.env,
        API_READ_TOKEN: 'test-family-key-12345678901234567890',
        ANDROID_APP_LINK_SHA256_FINGERPRINTS: ` ${fingerprint.toLowerCase()} , ${fingerprint} `,
      });
    });
    afterEach(() => jest.restoreAllMocks());

    test('redirects Android browsers to Google Play without a family token', async () => {
      await request(app.getHttpServer()).get('/share?url=https://example.org')
        .set('User-Agent', 'Mozilla/5.0 (Linux; Android 15)')
        .expect('Location', playStoreUrl)
        .expect('Cache-Control', 'no-store')
        .expect('Vary', /User-Agent/i)
        .expect(302);
    });

    test.each(['Mozilla/5.0 (Windows NT 10.0)', 'Mozilla/5.0 (iPhone)'])('shows an install page for %s', async userAgent => {
      const { text } = await request(app.getHttpServer()).get('/share')
        .set('User-Agent', userAgent)
        .expect('Content-Type', /text\/html/)
        .expect('Cache-Control', 'no-store')
        .expect('Vary', /User-Agent/i)
        .expect(200);
      expect(text).toContain(`href="${playStoreUrl}"`);
    });

    test('publishes Android Digital Asset Links while keeping family data protected', async () => {
      await request(app.getHttpServer()).get('/.well-known/assetlinks.json')
        .expect('Content-Type', /application\/json/)
        .expect(200, [{
          relation: ['delegate_permission/common.handle_all_urls'],
          target: {
            namespace: 'android_app',
            package_name: 'com.silsilah',
            sha256_cert_fingerprints: [fingerprint],
          },
        }]);
      await request(app.getHttpServer()).get('/api/v1/tree').expect(401);
      await request(app.getHttpServer()).get('/api/v1/share').expect(404);
      await request(app.getHttpServer()).get('/app').expect(404);
    });

    test.each(['', 'invalid', `${fingerprint},invalid`])('rejects invalid or missing fingerprints (%s)', async value => {
      process.env.ANDROID_APP_LINK_SHA256_FINGERPRINTS = value;
      await request(app.getHttpServer()).get('/.well-known/assetlinks.json').expect(503);
      await request(app.getHttpServer()).get('/share').expect(200);
    });
  });

  test('health and totals', async () => {
    await request(app.getHttpServer()).get('/api/v1/health').expect(200, { status: 'ok' });
    const { body } = await request(app.getHttpServer()).get('/api/v1/family').expect(200);
    expect(body.totalPeople).toBe(246);
  });
  test('search, filters, pagination, and validation are real', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/api/v1/members').query({ q: 'Zaenuri', limit: 1 }).expect(200);
    expect(body.total).toBe(2);
    expect(body.items).toHaveLength(1);
    await request(app.getHttpServer()).get('/api/v1/members?limit=1000').expect(400);
    await request(app.getHttpServer()).get('/api/v1/members?generation=abc').expect(400);
    await request(app.getHttpServer()).get('/api/v1/members?unexpected=true').expect(400);
  });
  test('opens an exact identity and its family, or returns 404', async () => {
    const id = graph.people.find(p => p.name === 'Inafah')!.id;
    const { body } = await request(app.getHttpServer()).get(`/api/v1/tree/${id}`).expect(200);
    expect(body.person.id).toBe(id);
    expect(body.children.map((p: { name: string }) => p.name)).toEqual(['Farida Khasna', 'Farid Tanwir']);
    await request(app.getHttpServer()).get('/api/v1/tree/missing').expect(404);
  });
  test('there are no write endpoints', async () => {
    await request(app.getHttpServer()).post('/api/v1/members').send({ name: 'No' }).expect(404);
    await request(app.getHttpServer()).patch('/api/v1/members/example').send({ name: 'No' }).expect(404);
    await request(app.getHttpServer()).delete('/api/v1/members/example').expect(404);
  });
  test('phone endpoint requires the family key and never allows caching', async () => {
    process.env.API_READ_TOKEN = 'test-family-key-12345678901234567890';
    try {
      await request(app.getHttpServer()).get('/api/v1/members/example-shared/phone').expect(401);
      await request(app.getHttpServer()).get('/api/v1/members/example-shared/phone')
        .set('x-family-key', process.env.API_READ_TOKEN)
        .expect('Cache-Control', 'private, no-store')
        .expect(200, { phoneNumber: sharedExamplePhone });
      await request(app.getHttpServer()).get('/api/v1/members/example-private/phone')
        .set('x-family-key', process.env.API_READ_TOKEN)
        .expect('Cache-Control', 'private, no-store')
        .expect(200, { phoneNumber: null });
    } finally {
      delete process.env.API_READ_TOKEN;
    }
  });
  test('access key is checked, health stays available', async () => {
    process.env.API_READ_TOKEN = 'test-family-key-12345678901234567890';
    await request(app.getHttpServer()).get('/api/v1/tree').expect(401);
    await request(app.getHttpServer()).get('/api/v1/tree').set('x-family-key', 'wrong').expect(401);
    await request(app.getHttpServer()).get('/api/v1/tree')
      .set('x-family-key', process.env.API_READ_TOKEN).expect(200);
    await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    delete process.env.API_READ_TOKEN;
  });
  test('production rejects missing/short credentials', () => {
    expect(() => readConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://example' })).toThrow('API_READ_TOKEN');
    expect(() => readConfig({ PORT: '-1' })).toThrow('Invalid PORT');
  });
});
