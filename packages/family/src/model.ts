export type PersonRole = 'FOUNDER' | 'ANCHOR' | 'MEMBER' | 'PARTNER';
export type RelationshipKind = 'SOURCE_BRANCH' | 'SOURCE_GROUP';

export interface Person {
  id: string;
  name: string;
  searchName: string;
  generation: number;
  role: PersonRole;
  branchId: string | null;
  sourceLabel: string | null;
  sourcePath: string;
  annotations: string[];
}

export interface Branch {
  id: string;
  anchorId: string;
  sourceFamilyId: number;
  position: number;
}

/** A source family group, not a claim of biological parentage. */
export interface FamilyUnion {
  id: string;
  partnerIds: string[];
  label: string | null;
  note: string | null;
  position: number;
  sourcePath: string;
}

export interface ChildLink {
  id: string;
  unionId: string;
  childId: string;
  position: number;
  kind: RelationshipKind;
}

export interface Dataset {
  id: string;
  title: string;
  notes: string;
  checksum: string;
  importedAt: string | null;
  rootUnionId: string;
}

export interface FamilyGraph {
  dataset: Dataset;
  people: Person[];
  branches: Branch[];
  unions: FamilyUnion[];
  childLinks: ChildLink[];
}

export interface FamilySummary {
  title: string;
  totalPeople: number;
  totalBranches: number;
  totalGenerations: number;
  generationCounts: Record<number, number>;
  totalPartners: number;
  importedAt: string | null;
  checksum: string;
}

export interface MemberQuery {
  q?: string;
  branchId?: string;
  generation?: number;
  page?: number;
  limit?: number;
}

export interface MemberPage {
  items: Person[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ChildGroup {
  union: FamilyUnion;
  partners: Person[];
  children: Person[];
}

export interface PersonFocus {
  person: Person;
  partners: Person[];
  groups: ChildGroup[];
  children: Person[];
  parentGroups: ChildGroup[];
  branch: Branch | null;
  descendantCount: number;
  /** Unique source-linked people at each relative depth: 1=anak, 2=cucu, 3=cicit. */
  descendantCounts: Record<number, number>;
}
