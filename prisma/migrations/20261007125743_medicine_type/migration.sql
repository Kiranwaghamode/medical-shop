-- CreateEnum
CREATE TYPE "MedicineType" AS ENUM ('GENERIC', 'ETHICAL');

-- AlterTable
ALTER TABLE "Medicine" ADD COLUMN     "medicineType" "MedicineType";
