/*
  Warnings:

  - Added the required column `soldBy` to the `SaleItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `unitsDeducted` to the `SaleItem` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "SoldBy" AS ENUM ('PACK', 'UNIT');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENT', 'AMOUNT');

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "customerName" TEXT,
ADD COLUMN     "customerPhone" TEXT,
ADD COLUMN     "discountType" "DiscountType",
ADD COLUMN     "discountValue" DECIMAL(12,2),
ADD COLUMN     "doctorName" TEXT;

-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN     "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "soldBy" "SoldBy" NOT NULL,
ADD COLUMN     "unitsDeducted" INTEGER NOT NULL;

-- Safety rules for the new columns (see *_safety_checks for the others).
ALTER TABLE "SaleItem"
  -- Loose lines remove exactly `quantity` units; pack lines remove a whole multiple of `quantity`.
  ADD CONSTRAINT "SaleItem_unitsDeducted_check" CHECK (
    "unitsDeducted" > 0 AND (
      ("soldBy" = 'UNIT' AND "unitsDeducted" = "quantity") OR
      ("soldBy" = 'PACK' AND "unitsDeducted" % "quantity" = 0)
    )
  ),
  ADD CONSTRAINT "SaleItem_discountAmount_check" CHECK ("discountAmount" >= 0 AND "discountAmount" <= "lineTotal"),
  -- GST is contained in what is actually paid for the line.
  ADD CONSTRAINT "SaleItem_taxAmount_le_paid" CHECK ("taxAmount" <= "lineTotal" - "discountAmount");

ALTER TABLE "Sale"
  -- Type and value go together; a percentage can't exceed 100.
  ADD CONSTRAINT "Sale_discountInput_check" CHECK (
    ("discountType" IS NULL AND "discountValue" IS NULL) OR
    ("discountType" IS NOT NULL AND "discountValue" >= 0 AND ("discountType" <> 'PERCENT' OR "discountValue" <= 100))
  ),
  ADD CONSTRAINT "Sale_customer_not_blank_check" CHECK (
    ("customerName" IS NULL OR char_length(btrim("customerName")) > 0) AND
    ("customerPhone" IS NULL OR char_length(btrim("customerPhone")) > 0) AND
    ("doctorName" IS NULL OR char_length(btrim("doctorName")) > 0)
  );
