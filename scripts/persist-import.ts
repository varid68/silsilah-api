import { Prisma, PrismaClient } from '@prisma/client';
import { type NormalizedImport } from '@silsilah/family/import';
import { assertGraph } from '@silsilah/family';

const IMPORTER_VERSION = 1;
const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

/** Atomic reconciliation: only JSON-managed rows in this dataset are archived.
 * Manual rows survive; source-owned fields are replaced by the authoritative JSON.
 */
export async function persistImport(
  prisma: PrismaClient, data: NormalizedImport, force = false, timeout = 60_000,
) {
  const { graph, source, provenance } = data;
  assertGraph(graph);
  return prisma.$transaction(async tx => {
    // Serialize concurrent imports of this dataset, including the first import.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${graph.dataset.id}))`;
    const previous = await tx.dataset.findUnique({ where: { id: graph.dataset.id } });
    if (!force && previous?.checksum === graph.dataset.checksum &&
      previous.importerVersion === IMPORTER_VERSION) {
      return { status: 'unchanged', people: graph.people.length };
    }
    const dataset = {
      title: graph.dataset.title, notes: graph.dataset.notes,
      checksum: graph.dataset.checksum, rootUnionId: graph.dataset.rootUnionId,
      source: json(source), importedAt: new Date(), importerVersion: IMPORTER_VERSION,
    };
    await tx.dataset.upsert({
      where: { id: graph.dataset.id },
      create: { id: graph.dataset.id, ...dataset }, update: dataset,
    });
    const where = { datasetId: graph.dataset.id, managedBy: 'json' };
    await tx.childLink.updateMany({ where, data: { active: false } });
    await tx.unionPartner.updateMany({ where, data: { active: false } });
    await tx.familyUnion.updateMany({ where, data: { active: false } });
    await tx.branch.updateMany({ where, data: { active: false } });
    await tx.person.updateMany({ where, data: { active: false } });
    const managed = { datasetId: graph.dataset.id, active: true, managedBy: 'json' };
    // The preceding update locks the existing source rows until commit.
    const overridden = new Set((await tx.person.findMany({
      where: { ...where, domicileAdminOverride: true }, select: { id: true },
    })).map(person => person.id));
    for (const person of graph.people) {
      // Branches refer back to anchors: create people, then branches, then memberships.
      const { domicileCity, ...sourceFields } = person;
      const record = { ...sourceFields, ...managed, branchId: null, source: json(provenance[person.id]) };
      await tx.person.upsert({
        where: { id: person.id },
        create: { ...record, domicileCity: domicileCity ?? null },
        update: overridden.has(person.id) ? record : { ...record, domicileCity: domicileCity ?? null },
      });
    }
    for (const branch of graph.branches) {
      const record = { ...branch, ...managed };
      await tx.branch.upsert({ where: { id: branch.id }, create: record, update: record });
    }
    for (const person of graph.people) {
      if (person.branchId) {
        await tx.person.update({ where: { id: person.id }, data: { branchId: person.branchId } });
      }
    }
    for (const union of graph.unions) {
      const { partnerIds, ...fields } = union;
      const record = { ...fields, ...managed, source: json(provenance[union.id]) };
      await tx.familyUnion.upsert({ where: { id: union.id }, create: record, update: record });
      for (const [position, personId] of partnerIds.entries()) {
        const membership = { unionId: union.id, personId, position, ...managed };
        await tx.unionPartner.upsert({
          where: { unionId_personId: { unionId: union.id, personId } },
          create: membership, update: membership,
        });
      }
    }
    for (const child of graph.childLinks) {
      const record = { ...child, ...managed };
      await tx.childLink.upsert({ where: { id: child.id }, create: record, update: record });
    }
    return { status: 'imported', people: graph.people.length, checksum: graph.dataset.checksum };
  }, { timeout, maxWait: 10_000 });
}
