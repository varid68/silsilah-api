BEGIN;

ALTER TABLE "Person" ADD COLUMN "domicileCity" TEXT;

CREATE TABLE "PersonPrivateContact" (
    "personId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "phoneShared" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "PersonPrivateContact_pkey" PRIMARY KEY ("personId"),
    CONSTRAINT "PersonPrivateContact_personId_fkey"
        FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- No public or application access. No contact records are included in the read API.
ALTER TABLE "PersonPrivateContact" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "PersonPrivateContact" FROM PUBLIC;
DO $$
DECLARE
    role_name TEXT;
BEGIN
    FOR role_name IN SELECT rolname FROM pg_roles
        WHERE rolname IN ('anon', 'authenticated', 'service_role', 'silsilah_reader')
    LOOP
        EXECUTE format('REVOKE ALL ON TABLE "PersonPrivateContact" FROM %I', role_name);
    END LOOP;
END;
$$;

COMMIT;
