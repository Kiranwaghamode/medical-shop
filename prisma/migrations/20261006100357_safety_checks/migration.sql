-- Safety rules enforced by the database itself, so no bug in application code can store impossible data.
-- Prisma's schema language cannot express CHECK constraints, so they live only in this migration.

-- Medicine
ALTER TABLE "Medicine"
  ADD CONSTRAINT "Medicine_name_not_blank_check"   CHECK (char_length(btrim("name")) > 0),
  ADD CONSTRAINT "Medicine_gstRate_range_check"    CHECK ("gstRate" >= 0 AND "gstRate" <= 100),
  ADD CONSTRAINT "Medicine_minimumStock_check"     CHECK ("minimumStock" >= 0);

-- InventoryBatch: stock can never go negative (this is what makes overselling impossible),
-- prices are non-negative, and nothing is sold above MRP.
ALTER TABLE "InventoryBatch"
  ADD CONSTRAINT "InventoryBatch_batchNumber_not_blank_check" CHECK (char_length(btrim("batchNumber")) > 0),
  ADD CONSTRAINT "InventoryBatch_quantity_check"              CHECK ("quantity" >= 0),
  ADD CONSTRAINT "InventoryBatch_prices_check"                CHECK ("mrp" >= 0 AND "purchasePrice" >= 0 AND "sellingPrice" >= 0),
  ADD CONSTRAINT "InventoryBatch_sellingPrice_le_mrp_check"   CHECK ("sellingPrice" <= "mrp");

-- Sale: amounts are non-negative, discount can't exceed the subtotal, total = subtotal − discount,
-- and the GST contained in the total can't exceed the total.
ALTER TABLE "Sale"
  ADD CONSTRAINT "Sale_amounts_check"        CHECK ("subtotal" >= 0 AND "discount" >= 0 AND "taxTotal" >= 0),
  ADD CONSTRAINT "Sale_discount_le_subtotal" CHECK ("discount" <= "subtotal"),
  ADD CONSTRAINT "Sale_total_check"          CHECK ("total" = "subtotal" - "discount"),
  ADD CONSTRAINT "Sale_taxTotal_le_total"    CHECK ("taxTotal" <= "total");

-- SaleItem: positive quantity, line total = unit price × quantity, price within MRP,
-- GST within the line total, sensible GST rate.
ALTER TABLE "SaleItem"
  ADD CONSTRAINT "SaleItem_quantity_check"       CHECK ("quantity" > 0),
  ADD CONSTRAINT "SaleItem_prices_check"         CHECK ("unitPrice" >= 0 AND "mrp" >= 0 AND "taxAmount" >= 0),
  ADD CONSTRAINT "SaleItem_unitPrice_le_mrp"     CHECK ("unitPrice" <= "mrp"),
  ADD CONSTRAINT "SaleItem_lineTotal_check"      CHECK ("lineTotal" = "unitPrice" * "quantity"),
  ADD CONSTRAINT "SaleItem_taxAmount_le_line"    CHECK ("taxAmount" <= "lineTotal"),
  ADD CONSTRAINT "SaleItem_gstRate_range_check"  CHECK ("gstRate" >= 0 AND "gstRate" <= 100);

-- InvoiceCounter
ALTER TABLE "InvoiceCounter"
  ADD CONSTRAINT "InvoiceCounter_lastNumber_check" CHECK ("lastNumber" >= 0);
