-- Run as the migration owner after creating the silsilah_dashboard login.
BEGIN;
GRANT USAGE ON SCHEMA public TO silsilah_dashboard;
GRANT SELECT ("id", "name", "datasetId", "generation", "branchId", "searchName", "active", "domicileCity"),
      UPDATE ("domicileCity", "domicileAdminOverride", "updatedAt")
  ON public."Person" TO silsilah_dashboard;
GRANT SELECT ("id", "datasetId", "anchorId", "active")
  ON public."Branch" TO silsilah_dashboard;
GRANT SELECT ("personId", "phoneNumber", "phoneShared"),
      INSERT ("personId", "phoneNumber", "phoneShared"),
      UPDATE ("phoneNumber", "phoneShared"), DELETE
  ON public."PersonPrivateContact" TO silsilah_dashboard;
DROP POLICY IF EXISTS silsilah_dashboard_contact ON public."PersonPrivateContact";
CREATE POLICY silsilah_dashboard_contact ON public."PersonPrivateContact"
  FOR ALL TO silsilah_dashboard USING (true) WITH CHECK (true);
COMMIT;
