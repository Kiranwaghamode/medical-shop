-- Fix: in SQL, `NULL >= 0` is "unknown", and a CHECK treats unknown as a pass, so a discount type with no
-- value slipped through. Require the value explicitly.
ALTER TABLE "Sale" DROP CONSTRAINT "Sale_discountInput_check";

ALTER TABLE "Sale"
  ADD CONSTRAINT "Sale_discountInput_check" CHECK (
    ("discountType" IS NULL AND "discountValue" IS NULL) OR
    (
      "discountType" IS NOT NULL AND "discountValue" IS NOT NULL AND "discountValue" >= 0 AND
      ("discountType" <> 'PERCENT' OR "discountValue" <= 100)
    )
  );
