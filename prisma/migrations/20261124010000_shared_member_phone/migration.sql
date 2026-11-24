BEGIN;

-- Runtime can read the opt-in projection, not the underlying contact table.
CREATE VIEW "SharedPersonPhone" WITH (security_barrier = true) AS
SELECT person."id" AS "personId", person."datasetId", contact."phoneNumber"
FROM "Person" person
JOIN "PersonPrivateContact" contact ON contact."personId" = person."id"
WHERE person."active" AND contact."phoneShared";

REVOKE ALL ON TABLE "SharedPersonPhone" FROM PUBLIC;
DO $$
DECLARE
    role_name TEXT;
BEGIN
    FOR role_name IN SELECT rolname FROM pg_roles
        WHERE rolname IN ('anon', 'authenticated', 'authenticator', 'service_role', 'silsilah_reader')
    LOOP
        EXECUTE format('REVOKE ALL ON TABLE "SharedPersonPhone" FROM %I', role_name);
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'silsilah_reader') THEN
        GRANT SELECT ON TABLE "SharedPersonPhone" TO silsilah_reader;
    END IF;
END;
$$;

COMMIT;
