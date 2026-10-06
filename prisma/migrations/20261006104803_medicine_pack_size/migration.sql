-- AlterTable
ALTER TABLE "Medicine" ADD COLUMN     "packLabel" TEXT NOT NULL DEFAULT 'pack',
ADD COLUMN     "packSize" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "unitLabel" TEXT NOT NULL DEFAULT 'unit';

-- Safety rules for the new columns (see *_safety_checks for the others).
ALTER TABLE "Medicine"
  ADD CONSTRAINT "Medicine_packSize_check"         CHECK ("packSize" >= 1),
  ADD CONSTRAINT "Medicine_labels_not_blank_check" CHECK (char_length(btrim("unitLabel")) > 0 AND char_length(btrim("packLabel")) > 0);
