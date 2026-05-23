-- Simplify CasePhase to the six business stages used in V1 UI.
-- Old phases are mapped before the PostgreSQL enum is recreated.

UPDATE "Case"
SET "casePhase" = 'preparing_application'
WHERE "casePhase" = 'ready_to_submit';

UPDATE "Case"
SET "casePhase" = 'collecting_documents'
WHERE "casePhase" = 'additional_documents_requested';

UPDATE "Case"
SET "casePhase" = 'submitted'
WHERE "casePhase" = 'resubmitted';

UPDATE "Case"
SET "casePhase" = 'approved'
WHERE "casePhase" = 'rejected';

UPDATE "Case"
SET "casePhase" = 'approved'
WHERE "casePhase" = 'closed';

ALTER TABLE "Case" ALTER COLUMN "casePhase" DROP DEFAULT;

ALTER TYPE "CasePhase" RENAME TO "CasePhase_old";

CREATE TYPE "CasePhase" AS ENUM (
  'draft',
  'collecting_documents',
  'preparing_application',
  'submitted',
  'under_review',
  'approved'
);

ALTER TABLE "Case"
  ALTER COLUMN "casePhase" TYPE "CasePhase"
  USING ("casePhase"::text::"CasePhase");

ALTER TABLE "Case" ALTER COLUMN "casePhase" SET DEFAULT 'draft';

DROP TYPE "CasePhase_old";
