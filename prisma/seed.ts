/**
 * Development sample data: realistic medicines with several batches each, including deliberate
 * low-stock, out-of-stock, expiring-soon, expired and inactive cases for testing alerts and sale rules.
 *
 * Run: npm run db:seed   (safe to re-run: sample rows are matched by barcode / batch number and reset;
 *                        medicines you added yourself are never touched)
 *
 * Prices, MRPs and GST rates are SAMPLE values for development only, not reference data.
 */
import "dotenv/config";
import { db } from "@/lib/db";
import { getOrCreateSharedShopId } from "@/services/user.service";

if (process.env.NODE_ENV === "production" && !process.argv.includes("--force")) {
  console.error("Refusing to seed sample data with NODE_ENV=production (pass --force to override).");
  process.exit(1);
}

// Last day of the month `monthsFromNow` months away (pharma packs print month/year expiry).
function expiryInMonths(monthsFromNow: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthsFromNow + 1, 0));
}

type SeedBatch = {
  batchNumber: string;
  expiresInMonths: number;
  quantity: number;
  mrp: string;
  sellingPrice?: string; // defaults to MRP
  purchasePrice: string;
};

type SeedMedicine = {
  name: string;
  genericName: string;
  category: string;
  manufacturer: string;
  barcode: string;
  gstRate: string;
  minimumStock: number;
  isActive?: boolean;
  scenario: string;
  batches: SeedBatch[];
};

const medicines: SeedMedicine[] = [
  {
    name: "Dolo 650", genericName: "Paracetamol 650 mg", category: "Analgesic", manufacturer: "Micro Labs",
    barcode: "8901234500011", gstRate: "5", minimumStock: 30,
    scenario: "one expired batch, one expiring this month, one long-dated (FEFO test)",
    batches: [
      { batchNumber: "DL24A01", expiresInMonths: -2, quantity: 5, mrp: "33.60", purchasePrice: "24.10" },
      { batchNumber: "DL25B07", expiresInMonths: 0, quantity: 20, mrp: "33.60", purchasePrice: "24.10" },
      { batchNumber: "DL26C11", expiresInMonths: 18, quantity: 100, mrp: "33.60", sellingPrice: "32.00", purchasePrice: "24.50" },
    ],
  },
  {
    name: "Crocin Advance", genericName: "Paracetamol 500 mg", category: "Analgesic", manufacturer: "GSK",
    barcode: "8901234500028", gstRate: "5", minimumStock: 20,
    scenario: "low stock (6 left, minimum 20)",
    batches: [{ batchNumber: "CR25X02", expiresInMonths: 14, quantity: 6, mrp: "20.00", purchasePrice: "14.20" }],
  },
  {
    name: "Azithral 500", genericName: "Azithromycin 500 mg", category: "Antibiotic", manufacturer: "Alembic",
    barcode: "8901234500035", gstRate: "5", minimumStock: 10,
    scenario: "expiring within ~2 months",
    batches: [{ batchNumber: "AZ25K19", expiresInMonths: 1, quantity: 25, mrp: "119.50", purchasePrice: "84.00" }],
  },
  {
    name: "Augmentin 625 Duo", genericName: "Amoxicillin 500 mg + Clavulanic acid 125 mg", category: "Antibiotic",
    manufacturer: "GSK", barcode: "8901234500042", gstRate: "5", minimumStock: 10, scenario: "normal",
    batches: [
      { batchNumber: "AG25M03", expiresInMonths: 9, quantity: 18, mrp: "204.00", purchasePrice: "150.00" },
      { batchNumber: "AG26A14", expiresInMonths: 20, quantity: 30, mrp: "210.00", purchasePrice: "155.00" },
    ],
  },
  {
    name: "Pan 40", genericName: "Pantoprazole 40 mg", category: "Antacid", manufacturer: "Alkem",
    barcode: "8901234500059", gstRate: "5", minimumStock: 15, scenario: "normal",
    batches: [{ batchNumber: "PN25J22", expiresInMonths: 16, quantity: 60, mrp: "155.00", sellingPrice: "149.00", purchasePrice: "108.00" }],
  },
  {
    name: "Glycomet 500", genericName: "Metformin 500 mg", category: "Antidiabetic", manufacturer: "USV",
    barcode: "8901234500066", gstRate: "5", minimumStock: 20,
    scenario: "out of stock (batch quantity 0)",
    batches: [{ batchNumber: "GM25F08", expiresInMonths: 12, quantity: 0, mrp: "35.00", purchasePrice: "24.50" }],
  },
  {
    name: "Telma 40", genericName: "Telmisartan 40 mg", category: "Antihypertensive", manufacturer: "Glenmark",
    barcode: "8901234500073", gstRate: "5", minimumStock: 10, scenario: "normal",
    batches: [{ batchNumber: "TM26B02", expiresInMonths: 22, quantity: 40, mrp: "230.00", purchasePrice: "165.00" }],
  },
  {
    name: "Allegra 120", genericName: "Fexofenadine 120 mg", category: "Antihistamine", manufacturer: "Sanofi",
    barcode: "8901234500080", gstRate: "5", minimumStock: 10, scenario: "normal",
    batches: [{ batchNumber: "AL25L30", expiresInMonths: 11, quantity: 22, mrp: "220.00", purchasePrice: "158.00" }],
  },
  {
    name: "Shelcal 500", genericName: "Calcium carbonate + Vitamin D3", category: "Supplement", manufacturer: "Torrent",
    barcode: "8901234500097", gstRate: "18", minimumStock: 10, scenario: "normal, different GST rate",
    batches: [{ batchNumber: "SC26C05", expiresInMonths: 24, quantity: 35, mrp: "120.00", purchasePrice: "82.00" }],
  },
  {
    name: "Electral ORS", genericName: "Oral rehydration salts", category: "Electrolyte", manufacturer: "FDC",
    barcode: "8901234500103", gstRate: "5", minimumStock: 50, scenario: "two batches add up to low stock",
    batches: [
      { batchNumber: "EL25H11", expiresInMonths: 6, quantity: 15, mrp: "22.00", purchasePrice: "15.00" },
      { batchNumber: "EL26A03", expiresInMonths: 19, quantity: 20, mrp: "22.00", purchasePrice: "15.00" },
    ],
  },
  {
    name: "Benadryl Cough Syrup", genericName: "Diphenhydramine + Ammonium chloride", category: "Cough & Cold",
    manufacturer: "Johnson & Johnson", barcode: "8901234500110", gstRate: "5", minimumStock: 8, scenario: "normal",
    batches: [{ batchNumber: "BN25G17", expiresInMonths: 8, quantity: 12, mrp: "125.00", purchasePrice: "90.00" }],
  },
  {
    name: "Okacet", genericName: "Cetirizine 10 mg", category: "Antihistamine", manufacturer: "Cipla",
    barcode: "8901234500127", gstRate: "5", minimumStock: 10, isActive: false,
    scenario: "inactive (discontinued) — hidden from sale",
    batches: [{ batchNumber: "OK25D09", expiresInMonths: 10, quantity: 40, mrp: "18.00", purchasePrice: "12.00" }],
  },
];

async function main() {
  const shopId = await getOrCreateSharedShopId();
  const shop = await db.shop.findUniqueOrThrow({ where: { id: shopId }, select: { name: true } });
  console.log(`Seeding sample medicines into "${shop.name}"…\n`);

  for (const m of medicines) {
    const fields = {
      name: m.name,
      genericName: m.genericName,
      category: m.category,
      manufacturer: m.manufacturer,
      gstRate: m.gstRate,
      minimumStock: m.minimumStock,
      isActive: m.isActive ?? true,
    };
    const medicine = await db.medicine.upsert({
      where: { shopId_barcode: { shopId, barcode: m.barcode } },
      create: { shopId, barcode: m.barcode, ...fields },
      update: fields,
    });

    for (const b of m.batches) {
      const batch = {
        expiryDate: expiryInMonths(b.expiresInMonths),
        quantity: b.quantity,
        mrp: b.mrp,
        sellingPrice: b.sellingPrice ?? b.mrp,
        purchasePrice: b.purchasePrice,
      };
      await db.inventoryBatch.upsert({
        where: { medicineId_batchNumber: { medicineId: medicine.id, batchNumber: b.batchNumber } },
        create: { medicineId: medicine.id, batchNumber: b.batchNumber, ...batch },
        update: batch,
      });
    }

    const stock = m.batches.reduce((sum, b) => sum + b.quantity, 0);
    console.log(`  ${m.name.padEnd(22)} ${String(stock).padStart(4)} in stock, ${m.batches.length} batch(es) — ${m.scenario}`);
  }

  const [medicineCount, batchCount] = await Promise.all([
    db.medicine.count({ where: { shopId } }),
    db.inventoryBatch.count({ where: { medicine: { shopId } } }),
  ]);
  console.log(`\nDone. Shop now has ${medicineCount} medicines and ${batchCount} batches.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
