import { z } from 'zod';
import type { FamilyGraph, PersonRole } from './model';
import { assertGraph, normalizeSearch } from './selectors';

export interface SourceSpouse {
  id?: string;
  label?: string;
  spouse: string;
  children?: SourceEntry[];
}
export interface SourceEntry {
  id?: string;
  name: string;
  domicileCity?: string;
  label?: string;
  spouse?: string;
  children?: SourceEntry[];
  spouses?: SourceSpouse[];
}
export interface SourceFamily {
  id: number;
  parents: { name: string; spouse?: string };
  children?: SourceEntry[];
  spouses?: SourceSpouse[];
}
export interface FamilySource {
  title: string;
  root_couple: { husband: string; wife: string };
  notes: string;
  families: SourceFamily[];
}
const name = z.string().min(1).max(250).refine(value => !!value.trim(), 'Empty name');
const explicitId = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
const entrySchema: z.ZodType<SourceEntry> = z.lazy(() =>
  z.object({
    id: explicitId.optional(),
    name,
    domicileCity: z.string().trim().min(1).max(100).optional(),
    label: z.string().min(1).max(64).optional(),
    spouse: name.optional(),
    children: z.array(entrySchema).max(500).optional(),
    spouses: z.array(spouseSchema).max(20).optional(),
  }).strict().refine(value => !value.spouses || (!value.spouse && !value.children),
    'Use either spouse/children or explicit spouses, not both'),
);
const spouseSchema: z.ZodType<SourceSpouse> = z.lazy(() =>
  z.object({
    id: explicitId.optional(),
    label: z.string().min(1).max(64).optional(),
    spouse: name,
    children: z.array(entrySchema).max(500).optional(),
  }).strict(),
);
const sourceSchema: z.ZodType<FamilySource> = z.object({
  title: z.string().min(1).max(500),
  root_couple: z.object({ husband: name, wife: name }).strict(),
  notes: z.string().max(10000),
  families: z.array(z.object({
    id: z.number().int().positive(),
    parents: z.object({ name, spouse: name.optional() }).strict(),
    children: z.array(entrySchema).max(500).optional(),
    spouses: z.array(spouseSchema).max(20).optional(),
  }).strict().refine(value => !value.spouses || (!value.parents.spouse && !value.children),
    'Use either parents.spouse/children or explicit spouses')).min(1).max(200),
}).strict();

export interface NormalizedImport {
  graph: FamilyGraph;
  source: FamilySource;
  provenance: Record<string, unknown>;
  warnings: string[];
}

export function normalizeSource(input: unknown, datasetId = 'asrori'): NormalizedImport {
  if (!/^[a-z0-9-]{1,50}$/.test(datasetId)) throw new Error('Invalid dataset ID');
  const source = sourceSchema.parse(input);
  if (new Set(source.families.map(f => f.id)).size !== source.families.length) {
    throw new Error('Duplicate source family ID');
  }
  const graph: FamilyGraph = {
    dataset: {
      id: datasetId, title: source.title, notes: source.notes, checksum: '',
      importedAt: null, rootUnionId: `${datasetId}-union-root`,
    },
    people: [], branches: [], unions: [], childLinks: [],
  };
  const provenance: Record<string, unknown> = {};
  const warnings = [
    'Family groups and branch order reflect the source, not verified biological parentage.',
    '(M) is preserved verbatim; no global inference of gender, death, or lineage is made.',
    'For unlabeled entries, IDs use source position. Add an explicit id before reordering them.',
  ];
  const addPerson = (
    key: string, value: string, generation: number, branchId: string | null,
    role: PersonRole, path: string, raw: unknown, label?: string, domicileCity?: string,
  ) => {
    if (generation > 12 || graph.people.length >= 10000) throw new Error('Source too large/deep');
    const id = `${datasetId}-person-${key}`;
    graph.people.push({
      id, name: value, searchName: normalizeSearch(value), generation, branchId, role,
      sourceLabel: label ?? null, sourcePath: path,
      ...(domicileCity ? { domicileCity } : {}),
      annotations: [...value.matchAll(/\(([^)]+)\)/g)].map(match => match[1]),
    });
    provenance[id] = raw;
    return id;
  };
  const addUnion = (
    key: string, partnerIds: string[], path: string, raw: unknown,
    label?: string, note?: string,
  ) => {
    const id = `${datasetId}-union-${key}`;
    graph.unions.push({
      id, partnerIds, position: graph.unions.length, sourcePath: path,
      label: label ?? null, note: note ?? null,
    });
    provenance[id] = raw;
    return id;
  };
  const link = (
    unionId: string, childId: string, position: number, branch = false,
  ) => graph.childLinks.push({
    id: `${unionId}-child-${childId}`, unionId, childId, position,
    kind: branch ? 'SOURCE_BRANCH' : 'SOURCE_GROUP',
  });
  const keyFor = (entry: SourceEntry, index: number) => entry.id
    ? `id-${entry.id}`
    : entry.label ? `label-${encodeURIComponent(entry.label)}` : `pos-${index + 1}`;

  const addChildren = (
    children: SourceEntry[], unionId: string, key: string, path: string,
    generation: number, branchId: string,
  ) => {
    const keys = children.map(keyFor);
    if (new Set(keys).size !== keys.length) throw new Error(`Duplicate child id/label at ${path}`);
    children.forEach((child, index) => {
      const childKey = `${key}-c-${keys[index]}`;
      const childPath = `${path}/${index}`;
      const id = addPerson(
        childKey, child.name, generation, branchId, 'MEMBER', childPath, child, child.label, child.domicileCity,
      );
      link(unionId, id, index);
      addHousehold(child, id, childKey, childPath, generation, branchId, false);
    });
  };
  const addHousehold = (
    entry: Pick<SourceEntry, 'spouse' | 'spouses' | 'children'>,
    personId: string, key: string, path: string, generation: number,
    branchId: string, force: boolean,
  ) => {
    if (entry.spouses) {
      const keys = entry.spouses.map((spouse, i) => spouse.id ? `id-${spouse.id}` : `s${i + 1}`);
      if (new Set(keys).size !== keys.length) throw new Error(`Duplicate spouse id at ${path}`);
      entry.spouses.forEach((spouse, index) => {
        const spouseKey = `${key}-${keys[index]}`;
        const spousePath = `${path}/spouses/${index}`;
        const partnerId = addPerson(
          `${spouseKey}-partner`, spouse.spouse, generation, branchId,
          'PARTNER', `${spousePath}/spouse`, spouse,
        );
        const unionId = addUnion(spouseKey, [personId, partnerId], spousePath, spouse, spouse.label);
        addChildren(spouse.children ?? [], unionId, spouseKey,
          `${spousePath}/children`, generation + 1, branchId);
      });
      return;
    }
    const spouseNames = entry.spouse?.split(' & ') ?? [];
    if (spouseNames.some(value => !value.trim())) throw new Error(`Empty spouse at ${path}`);
    if (spouseNames.length > 1) {
      // Source lists children once, without identifying which spouse is their parent.
      // Keep separate unions AND a source-only child group; never assign children to both.
      spouseNames.forEach((value, index) => {
        const partnerId = addPerson(
          `${key}-partner-${index + 1}`, value, generation, branchId, 'PARTNER',
          `${path}/spouse`, { rawSpouse: entry.spouse, splitIndex: index },
        );
        addUnion(`${key}-s${index + 1}`, [personId, partnerId], path, entry,
          `Pasangan ${index + 1}`, 'Keterkaitan anak dengan pasangan belum dipastikan dalam sumber.');
      });
      const note = 'Sumber mencantumkan beberapa pasangan tanpa pembagian anak. Hubungan anak dengan masing-masing pasangan belum dipastikan.';
      warnings.push(`${key}: ${note}`);
      const unionId = addUnion(`${key}-children`, [personId], path, entry, 'Kelompok anak dari sumber', note);
      addChildren(entry.children ?? [], unionId, key, `${path}/children`, generation + 1, branchId);
    } else if (entry.spouse || entry.children?.length || force) {
      const partnerIds = [personId];
      if (entry.spouse) {
        partnerIds.push(addPerson(`${key}-partner`, entry.spouse, generation,
          branchId, 'PARTNER', `${path}/spouse`, { spouse: entry.spouse }));
      }
      const unionId = addUnion(key, partnerIds, path, entry);
      addChildren(entry.children ?? [], unionId, key, `${path}/children`, generation + 1, branchId);
    }
  };

  const husband = addPerson('root-husband', source.root_couple.husband, 1,
    null, 'FOUNDER', '/root_couple/husband', source.root_couple);
  const wife = addPerson('root-wife', source.root_couple.wife, 1,
    null, 'FOUNDER', '/root_couple/wife', source.root_couple);
  const rootUnion = addUnion('root', [husband, wife], '/root_couple', source.root_couple,
    'Pendiri', 'Cabang mengikuti susunan sumber; hubungan biologis tiap jangkar belum diverifikasi.');
  source.families.forEach((family, index) => {
    const key = `f${family.id}`;
    const branchId = `${datasetId}-branch-${family.id}`;
    const path = `/families/${index}`;
    const anchorId = addPerson(`${key}-anchor`, family.parents.name, 2,
      branchId, 'ANCHOR', `${path}/parents/name`, family.parents);
    graph.branches.push({ id: branchId, anchorId, sourceFamilyId: family.id, position: index });
    link(rootUnion, anchorId, index, true);
    addHousehold({
      spouse: family.parents.spouse, spouses: family.spouses, children: family.children,
    }, anchorId, key, path, 2, branchId, true);
  });
  assertGraph(graph);
  return { graph, source, provenance, warnings };
}
