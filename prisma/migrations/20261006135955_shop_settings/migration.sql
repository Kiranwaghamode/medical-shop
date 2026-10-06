-- CreateEnum
CREATE TYPE "PaperSize" AS ENUM ('A4', 'A5');

-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "autoPrint" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "billFooter" TEXT,
ADD COLUMN     "billPaperSize" "PaperSize" NOT NULL DEFAULT 'A5',
ADD COLUMN     "drugLicenseNumber" TEXT;

-- Shop name is printed on every bill; optional text fields are either NULL or real text.
ALTER TABLE "Shop"
  ADD CONSTRAINT "Shop_name_not_blank_check" CHECK (char_length(btrim("name")) > 0),
  ADD CONSTRAINT "Shop_optional_text_not_blank_check" CHECK (
    ("address" IS NULL OR char_length(btrim("address")) > 0) AND
    ("phone" IS NULL OR char_length(btrim("phone")) > 0) AND
    ("gstin" IS NULL OR char_length(btrim("gstin")) > 0) AND
    ("drugLicenseNumber" IS NULL OR char_length(btrim("drugLicenseNumber")) > 0) AND
    ("billFooter" IS NULL OR char_length(btrim("billFooter")) > 0)
  );
