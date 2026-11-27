-- Restore additive admin columns on databases with schema drift.
ALTER TABLE "Person"
  ADD COLUMN IF NOT EXISTS "domicileCity" TEXT,
  ADD COLUMN IF NOT EXISTS "domicileAdminOverride" BOOLEAN NOT NULL DEFAULT false;
