import { Injectable, NotFoundException, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { applyContactPatch, PAGE_SIZE, type MemberPatch } from './admin-member-validation';

type Summary = {
  id: string; name: string; branch: string | null; generation: number;
  domicileCity: string | null; phoneShared: boolean; hasPhone: boolean;
};
type MemberDetail = Summary & { phoneNumber: string | null };
type MemberPage = { members: Summary[]; total: number; generations: number[] };

const dataset = () => process.env.DATASET_ID || 'asrori';
const fields = Prisma.sql`p."id", p."name", p."generation", p."domicileCity", a."name" AS branch,
  c."personId" IS NOT NULL AS "hasPhone", COALESCE(c."phoneShared", false) AS "phoneShared"`;
const memberSource = (datasetId: string) => Prisma.sql`
  FROM public."Person" p
  LEFT JOIN public."Branch" b ON b."id" = p."branchId" AND b."datasetId" = p."datasetId" AND b."active"
  LEFT JOIN public."Person" a ON a."id" = b."anchorId" AND a."datasetId" = p."datasetId" AND a."active"
  LEFT JOIN public."PersonPrivateContact" c ON c."personId" = p."id"
  WHERE p."datasetId" = ${datasetId} AND p."active"`;

@Injectable()
export class AdminMembersService implements OnModuleDestroy {
  private db?: PrismaClient;

  private database() {
    const url = process.env.ADMIN_DATABASE_URL;
    if (!url) throw new ServiceUnavailableException('Koneksi database admin belum dikonfigurasi di API NestJS.');
    return this.db ??= new PrismaClient({ datasources: { db: { url } } });
  }

  async onModuleDestroy() {
    await this.db?.$disconnect();
  }

  async list(q: string, generation: number | null, page: number) {
    const datasetId = dataset();
    const search = '%' + q.toLowerCase().replace(/[\\%_]/g, '\\$&') + '%';
    const [result] = await this.database().$queryRaw<MemberPage[]>`
      WITH filtered AS (
        SELECT ${fields}, p."searchName" ${memberSource(datasetId)}
        AND (${generation}::int IS NULL OR p."generation" = ${generation}::int)
        AND (p."searchName" LIKE ${search} OR LOWER(p."name") LIKE ${search})
      ), page AS (
        SELECT * FROM filtered ORDER BY "searchName", "id" LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}
      )
      SELECT COALESCE((SELECT json_agg(to_jsonb(page) - 'searchName' ORDER BY "searchName", "id") FROM page), '[]') AS members,
        (SELECT COUNT(*)::int FROM filtered) AS total,
        ARRAY(SELECT DISTINCT "generation" FROM public."Person"
          WHERE "datasetId" = ${datasetId} AND "active" ORDER BY "generation") AS generations
    `;
    return result;
  }

  get(id: string) {
    return this.detail(id, dataset(), this.database());
  }

  private async detail(id: string, datasetId: string, db: Prisma.TransactionClient) {
    const [member] = await db.$queryRaw<MemberDetail[]>`
      SELECT ${fields}, c."phoneNumber" ${memberSource(datasetId)} AND p."id" = ${id}
    `;
    if (!member) throw new NotFoundException('Anggota tidak ditemukan.');
    return member;
  }

  async save(id: string, patch: MemberPatch) {
    const datasetId = dataset();
    return this.database().$transaction(async db => {
      const rows = await db.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM public."Person" WHERE "id" = ${id} AND "datasetId" = ${datasetId} AND "active" FOR UPDATE
      `;
      if (!rows.length) throw new NotFoundException('Anggota tidak ditemukan.');
      if (patch.domicileCity !== undefined) {
        await db.$executeRaw`
          UPDATE public."Person"
          SET "domicileCity" = ${patch.domicileCity}, "domicileAdminOverride" = true, "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${id}
        `;
      }
      if (patch.phoneNumber !== undefined || patch.phoneShared !== undefined) {
        const contact = applyContactPatch(await this.detail(id, datasetId, db), patch);
        if (contact.phoneNumber) {
          await db.$executeRaw`
            INSERT INTO public."PersonPrivateContact" ("personId", "phoneNumber", "phoneShared")
            VALUES (${id}, ${contact.phoneNumber}, ${contact.phoneShared})
            ON CONFLICT ("personId") DO UPDATE SET "phoneNumber" = EXCLUDED."phoneNumber", "phoneShared" = EXCLUDED."phoneShared"
          `;
        } else {
          await db.$executeRaw`DELETE FROM public."PersonPrivateContact" WHERE "personId" = ${id}`;
        }
      }
      return this.detail(id, datasetId, db);
    });
  }
}
