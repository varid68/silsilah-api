-- CreateEnum
CREATE TYPE "PersonRole" AS ENUM ('FOUNDER', 'ANCHOR', 'MEMBER', 'PARTNER');

-- CreateEnum
CREATE TYPE "RelationshipKind" AS ENUM ('SOURCE_BRANCH', 'SOURCE_GROUP');

-- CreateTable
CREATE TABLE "Dataset" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "importerVersion" INTEGER NOT NULL DEFAULT 1,
    "rootUnionId" TEXT NOT NULL,
    "source" JSONB NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "searchName" TEXT NOT NULL,
    "generation" INTEGER NOT NULL,
    "role" "PersonRole" NOT NULL,
    "branchId" TEXT,
    "sourceLabel" TEXT,
    "sourcePath" TEXT NOT NULL,
    "annotations" TEXT[],
    "source" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "managedBy" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "anchorId" TEXT NOT NULL,
    "sourceFamilyId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "managedBy" TEXT NOT NULL DEFAULT 'manual',

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FamilyUnion" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "label" TEXT,
    "note" TEXT,
    "position" INTEGER NOT NULL,
    "sourcePath" TEXT NOT NULL,
    "source" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "managedBy" TEXT NOT NULL DEFAULT 'manual',

    CONSTRAINT "FamilyUnion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnionPartner" (
    "unionId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "managedBy" TEXT NOT NULL DEFAULT 'manual',

    CONSTRAINT "UnionPartner_pkey" PRIMARY KEY ("unionId","personId")
);

-- CreateTable
CREATE TABLE "ChildLink" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "unionId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" "RelationshipKind" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "managedBy" TEXT NOT NULL DEFAULT 'manual',

    CONSTRAINT "ChildLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Person_datasetId_active_idx" ON "Person"("datasetId", "active");

-- CreateIndex
CREATE INDEX "Person_branchId_generation_idx" ON "Person"("branchId", "generation");

-- CreateIndex
CREATE INDEX "Person_searchName_idx" ON "Person"("searchName");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_anchorId_key" ON "Branch"("anchorId");

-- CreateIndex
CREATE INDEX "Branch_datasetId_active_position_idx" ON "Branch"("datasetId", "active", "position");

-- CreateIndex
CREATE INDEX "FamilyUnion_datasetId_active_position_idx" ON "FamilyUnion"("datasetId", "active", "position");

-- CreateIndex
CREATE INDEX "UnionPartner_datasetId_active_idx" ON "UnionPartner"("datasetId", "active");

-- CreateIndex
CREATE INDEX "UnionPartner_personId_idx" ON "UnionPartner"("personId");

-- CreateIndex
CREATE INDEX "ChildLink_datasetId_active_idx" ON "ChildLink"("datasetId", "active");

-- CreateIndex
CREATE INDEX "ChildLink_childId_idx" ON "ChildLink"("childId");

-- CreateIndex
CREATE UNIQUE INDEX "ChildLink_unionId_childId_key" ON "ChildLink"("unionId", "childId");

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_anchorId_fkey" FOREIGN KEY ("anchorId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyUnion" ADD CONSTRAINT "FamilyUnion_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnionPartner" ADD CONSTRAINT "UnionPartner_unionId_fkey" FOREIGN KEY ("unionId") REFERENCES "FamilyUnion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnionPartner" ADD CONSTRAINT "UnionPartner_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnionPartner" ADD CONSTRAINT "UnionPartner_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChildLink" ADD CONSTRAINT "ChildLink_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChildLink" ADD CONSTRAINT "ChildLink_unionId_fkey" FOREIGN KEY ("unionId") REFERENCES "FamilyUnion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChildLink" ADD CONSTRAINT "ChildLink_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
