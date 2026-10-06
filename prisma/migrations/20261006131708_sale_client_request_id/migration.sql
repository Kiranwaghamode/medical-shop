-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "clientRequestId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Sale_shopId_clientRequestId_key" ON "Sale"("shopId", "clientRequestId");
