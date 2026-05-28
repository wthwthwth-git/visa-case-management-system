-- Merge legacy case phases into the five V1 phases.
ALTER TABLE "Case" ALTER COLUMN "casePhase" DROP DEFAULT;

ALTER TYPE "CasePhase" RENAME TO "CasePhase_old";

CREATE TYPE "CasePhase" AS ENUM (
  'draft',
  'collecting_documents',
  'preparing_application',
  'submitted',
  'approved'
);

ALTER TABLE "Case"
  ALTER COLUMN "casePhase" TYPE "CasePhase"
  USING (
    CASE
      WHEN "casePhase"::text IN ('under_review', 'resubmitted') THEN 'submitted'
      WHEN "casePhase"::text = 'ready_to_submit' THEN 'preparing_application'
      WHEN "casePhase"::text = 'additional_documents_requested' THEN 'collecting_documents'
      WHEN "casePhase"::text IN ('rejected', 'closed') THEN 'approved'
      ELSE "casePhase"::text
    END
  )::"CasePhase";

ALTER TABLE "Case" ALTER COLUMN "casePhase" SET DEFAULT 'draft';

DROP TYPE "CasePhase_old";
