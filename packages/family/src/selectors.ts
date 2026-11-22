import type {
  ChildGroup,
  FamilyGraph,
  FamilySummary,
  MemberPage,
  MemberQuery,
  Person,
  PersonFocus,
} from './model';

/** Search only: the displayed/source name is never rewritten. */
export function normalizeSearch(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘`ʼ]/g, "'")
    .toLocaleLowerCase('id-ID')
    .replace(/\s+/g, ' ')
    .trim();
}

export function initials(name: string): string {
  const words = name
    .replace(/\([^)]*\)/g, '')
    .replace(/\b(hj?|abd|m)\.\s*/gi, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words.slice(0, 2).map(word => word[0]).join('').toUpperCase() || '?';
}

/** Short label for compact tree nodes only; details retain the full source. */
export function compactName(name: string): string {
  return name.replace(/\s*\((?:M|Alm|Almh|\?)\)/g, '').trim();
}

export function descendantLabel(depth: number): string {
  return depth === 1 ? 'anak' : depth === 2 ? 'cucu' : depth === 3
    ? 'cicit' : `keturunan tingkat ${depth}`;
}

export function summarize(graph: FamilyGraph): FamilySummary {
  const generationCounts: Record<number, number> = {};
  for (const person of graph.people) {
    if (person.role !== 'PARTNER') {
      generationCounts[person.generation] =
        (generationCounts[person.generation] ?? 0) + 1;
    }
  }
  return {
    title: graph.dataset.title,
    totalPeople: graph.people.length,
    totalBranches: graph.branches.length,
    totalGenerations: Math.max(0, ...graph.people.map(p => p.generation)),
    generationCounts,
    totalPartners: graph.people.filter(p => p.role === 'PARTNER').length,
    importedAt: graph.dataset.importedAt,
    checksum: graph.dataset.checksum,
  };
}

export function members(graph: FamilyGraph, query: MemberQuery = {}): MemberPage {
  const tokens = normalizeSearch(query.q ?? '').split(' ').filter(Boolean);
  const limit = Math.max(1, Math.min(100, query.limit ?? 30));
  const page = Math.max(1, query.page ?? 1);
  const branchOrder = new Map(graph.branches.map(branch => [branch.id, branch.position]));
  const matching = graph.people
    .filter(person =>
      (!query.branchId || person.branchId === query.branchId) &&
      (!query.generation || person.generation === query.generation) &&
      tokens.every(token => person.searchName.includes(token)),
    )
    .sort((a, b) => {
      if (tokens.length) {
        const q = tokens.join(' ');
        const rank = (p: Person) =>
          p.searchName === q ? 0 : p.searchName.startsWith(q) ? 1 : 2;
        const difference = rank(a) - rank(b);
        if (difference) return difference;
      } else {
        const rank = (p: Person) => p.role === 'FOUNDER' ? 0 : p.role === 'ANCHOR' ? 1 : 2;
        const difference = rank(a) - rank(b) || a.generation - b.generation ||
          (branchOrder.get(a.branchId ?? '') ?? -1) - (branchOrder.get(b.branchId ?? '') ?? -1) ||
          a.sourcePath.localeCompare(b.sourcePath, 'id', { numeric: true });
        if (difference) return difference;
      }
      return a.name.localeCompare(b.name, 'id') || a.id.localeCompare(b.id);
    });
  return {
    items: matching.slice((page - 1) * limit, page * limit),
    total: matching.length,
    page,
    limit,
    totalPages: Math.ceil(matching.length / limit),
  };
}

export function childrenOf(graph: FamilyGraph, id: string): Person[] {
  const unions = graph.unions
    .filter(union => union.partnerIds.includes(id))
    .sort((a, b) => a.position - b.position);
  const ids = new Set(
    unions.flatMap(union => graph.childLinks
      .filter(link => link.unionId === union.id)
      .sort((a, b) => a.position - b.position)
      .map(link => link.childId)),
  );
  const byId = new Map(graph.people.map(p => [p.id, p]));
  return [...ids].map(childId => byId.get(childId)).filter((p): p is Person => !!p);
}

export function focusPerson(graph: FamilyGraph, id: string): PersonFocus | null {
  const byId = new Map(graph.people.map(p => [p.id, p]));
  const person = byId.get(id);
  if (!person) return null;
  const groupFor = (union: FamilyGraph['unions'][number]): ChildGroup => ({
    union,
    partners: union.partnerIds.map(p => byId.get(p)!).filter(Boolean),
    children: graph.childLinks
      .filter(link => link.unionId === union.id)
      .sort((a, b) => a.position - b.position)
      .map(link => byId.get(link.childId)!)
      .filter(Boolean),
  });
  const groups = graph.unions
    .filter(union => union.partnerIds.includes(id))
    .sort((a, b) => a.position - b.position)
    .map(groupFor);
  const partners = [...new Map(
    groups.flatMap(group => group.partners)
      .filter(p => p.id !== id).map(p => [p.id, p]),
  ).values()];
  const children = childrenOf(graph, id);
  const parentUnionIds = new Set(
    graph.childLinks.filter(link => link.childId === id).map(link => link.unionId),
  );
  const seen = new Set<string>([id, ...partners.map(p => p.id)]);
  const descendantCounts: Record<number, number> = {};
  // Breadth-first traversal counts each identity once at its shortest source depth.
  // generation fields are not subtracted: a source group need not imply biology.
  const queue = [{ id, depth: 0 }];
  for (let index = 0; index < queue.length; index++) {
    const parent = queue[index];
    for (const child of childrenOf(graph, parent.id)) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      const depth = parent.depth + 1;
      descendantCounts[depth] = (descendantCounts[depth] ?? 0) + 1;
      queue.push({ id: child.id, depth });
    }
  }
  return {
    person,
    partners,
    groups,
    children,
    parentGroups: graph.unions.filter(u => parentUnionIds.has(u.id)).map(groupFor),
    branch: graph.branches.find(branch => branch.id === person.branchId) ?? null,
    descendantCount: seen.size - partners.length - 1,
    descendantCounts,
  };
}

/** Reject dangling links, duplicates and cycles before a DB transaction begins. */
export function assertGraph(graph: FamilyGraph): void {
  const unique = (ids: string[], label: string) => {
    if (new Set(ids).size !== ids.length) throw new Error(`Duplicate ${label} ID`);
  };
  unique(graph.people.map(p => p.id), 'person');
  unique(graph.branches.map(b => b.id), 'branch');
  unique(graph.unions.map(u => u.id), 'union');
  unique(graph.childLinks.map(c => c.id), 'child link');
  const people = new Set(graph.people.map(p => p.id));
  const branches = new Set(graph.branches.map(b => b.id));
  const unions = new Map(graph.unions.map(u => [u.id, u]));
  if (!unions.has(graph.dataset.rootUnionId)) throw new Error('Missing root union');
  const adjacent = new Map<string, string[]>();
  for (const person of graph.people) {
    if (person.branchId && !branches.has(person.branchId)) throw new Error('Missing branch');
    if (!Number.isInteger(person.generation) || person.generation < 1) throw new Error('Invalid generation');
  }
  for (const branch of graph.branches) {
    if (!people.has(branch.anchorId)) throw new Error('Missing branch anchor');
  }
  for (const union of graph.unions) {
    unique(union.partnerIds, 'partner');
    if (!union.partnerIds.length || union.partnerIds.some(id => !people.has(id))) {
      throw new Error('Missing union partner');
    }
  }
  const pairs = new Set<string>();
  for (const link of graph.childLinks) {
    const union = unions.get(link.unionId);
    if (!union || !people.has(link.childId)) throw new Error('Dangling child link');
    if (union.partnerIds.includes(link.childId)) throw new Error('Self-parent relationship');
    const pair = `${link.unionId}:${link.childId}`;
    if (pairs.has(pair)) throw new Error('Duplicate parent-child relationship');
    pairs.add(pair);
    for (const parent of union.partnerIds) {
      adjacent.set(parent, [...(adjacent.get(parent) ?? []), link.childId]);
    }
  }
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const walk = (id: string) => {
    if (visiting.has(id)) throw new Error('Cycle in family graph');
    if (visited.has(id)) return;
    visiting.add(id);
    for (const child of adjacent.get(id) ?? []) walk(child);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of people) walk(id);
}
