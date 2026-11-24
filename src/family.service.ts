import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  assertGraph, focusPerson, members, summarize,
  type FamilyGraph, type MemberQuery, type PersonFocus,
} from '@silsilah/family';
import { PrismaService } from './prisma.service';

@Injectable()
export class FamilyService {
  private cached: { graph: FamilyGraph; expiresAt: number } | undefined;
  private pending: Promise<FamilyGraph> | undefined;

  constructor(private readonly prisma: PrismaService) {}

  async graph(): Promise<FamilyGraph> {
    if (this.cached && this.cached.expiresAt > Date.now()) return this.cached.graph;
    if (!this.pending) {
      this.pending = this.loadGraph().then(graph => {
        this.cached = { graph, expiresAt: Date.now() + 30_000 };
        return graph;
      }).finally(() => { this.pending = undefined; });
    }
    return this.pending;
  }

  private async loadGraph(): Promise<FamilyGraph> {
    const datasetId = process.env.DATASET_ID ?? 'asrori';
    const where = { datasetId, active: true };
    const [dataset, people, branches, unions, links] = await this.prisma.$transaction([
      this.prisma.dataset.findUnique({ where: { id: datasetId } }),
      this.prisma.person.findMany({ where, orderBy: { id: 'asc' } }),
      this.prisma.branch.findMany({ where, orderBy: { position: 'asc' } }),
      this.prisma.familyUnion.findMany({
        where, orderBy: { position: 'asc' },
        include: {
          partners: {
            where: { active: true, person: { active: true } },
            orderBy: { position: 'asc' },
          },
        },
      }),
      this.prisma.childLink.findMany({ where, orderBy: { position: 'asc' } }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    if (!dataset) throw new ServiceUnavailableException('Data keluarga belum diimpor.');
    const graph: FamilyGraph = {
      dataset: {
        id: dataset.id, title: dataset.title, notes: dataset.notes,
        checksum: dataset.checksum, importedAt: dataset.importedAt.toISOString(),
        rootUnionId: dataset.rootUnionId,
      },
      people: people.map(p => ({
        id: p.id, name: p.name, searchName: p.searchName, generation: p.generation,
        domicileCity: p.domicileCity,
        role: p.role, branchId: p.branchId, sourceLabel: p.sourceLabel,
        sourcePath: p.sourcePath, annotations: p.annotations,
      })),
      branches: branches.map(b => ({
        id: b.id, anchorId: b.anchorId, sourceFamilyId: b.sourceFamilyId, position: b.position,
      })),
      unions: unions.map(u => ({
        id: u.id, partnerIds: u.partners.map(p => p.personId), label: u.label,
        note: u.note, position: u.position, sourcePath: u.sourcePath,
      })),
      childLinks: links.map(c => ({
        id: c.id, unionId: c.unionId, childId: c.childId, kind: c.kind, position: c.position,
      })),
    };
    try { assertGraph(graph); } catch {
      throw new ServiceUnavailableException('Relasi keluarga perlu diperiksa oleh administrator.');
    }
    return graph;
  }

  async summary() { return summarize(await this.graph()); }
  async list(query: MemberQuery) { return members(await this.graph(), query); }
  async sharedPhone(personId: string): Promise<{ phoneNumber: string | null }> {
    const datasetId = process.env.DATASET_ID ?? 'asrori';
    const [row] = await this.prisma.$queryRaw<Array<{ phoneNumber: string }>>`
      SELECT "phoneNumber" FROM "SharedPersonPhone"
      WHERE "datasetId" = ${datasetId} AND "personId" = ${personId}
    `;
    return { phoneNumber: row?.phoneNumber ?? null };
  }

  async focus(id: string): Promise<PersonFocus> {
    const focus = focusPerson(await this.graph(), id);
    if (!focus) throw new NotFoundException('Anggota tidak ditemukan.');
    return focus;
  }
}
