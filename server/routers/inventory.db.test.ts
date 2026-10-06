// Calls the real tRPC router (validation → auth → service → database) in a temporary shop. `npm run test:db`
import { TRPCError } from "@trpc/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Access } from "@/lib/auth";
import { batchToFormValues, toBatchFields } from "@/lib/batch-form";
import { db } from "@/lib/db";
import { emptyMedicineForm, medicineToFormValues, toCreateMedicineInput, toUpdateMedicineFields } from "@/lib/medicine-form";
import { createCaller } from "@/server/root";

let shopId: string;
const clerkId = "test_router_inventory";
const asUser = () =>
  createCaller({
    db,
    headers: new Headers(),
    access: { status: "allowed", userId: clerkId, email: "router@test.dev" } satisfies Access,
  });

beforeAll(async () => {
  shopId = (await db.shop.create({ data: { name: "TEST router shop" } })).id;
  // Pre-create the user in the test shop so ensureUser() doesn't attach it to the real shop.
  await db.user.create({ data: { clerkId, email: "router@test.dev", shopId } });
});

afterAll(async () => {
  await db.inventoryBatch.deleteMany({ where: { medicine: { shopId } } });
  await db.medicine.deleteMany({ where: { shopId } });
  await db.user.deleteMany({ where: { shopId } });
  await db.shop.delete({ where: { id: shopId } });
  await db.$disconnect();
});

async function trpcError(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(TRPCError);
  return error as TRPCError;
}

describe("inventory router", () => {
  it("creates and lists a medicine scoped to the caller's shop", async () => {
    const caller = asUser();
    const { id } = await caller.inventory.create({
      name: "Router Med",
      gstRate: "5",
      packSize: 10,
      unitLabel: "tablet",
      packLabel: "strip",
      minimumStock: 0,
      firstBatch: { batchNumber: "r1", expiryMonth: "2030-01", mrp: "10.00", purchasePrice: "7.00", sellingPrice: "10.00", quantity: 50 },
    });
    const list = await caller.inventory.list({ search: "Router Med" });
    expect(list.items.map((i) => i.id)).toEqual([id]);
    expect(list.items[0]).toMatchObject({ sellableStock: 50, mrpMin: "10.00" });
  });

  it("accepts exactly what the Add / Edit medicine form sends", async () => {
    const caller = asUser();
    const form = {
      ...emptyMedicineForm,
      name: "  Form Med ",
      packSize: "15",
      minimumPacks: "2",
      batchNumber: "fm-1",
      expiryMonth: "2030-06",
      mrp: "33.60",
      purchasePrice: "24.00",
      packs: "3",
      loose: "4",
    };
    const { id } = await caller.inventory.create(toCreateMedicineInput(form));
    const created = await caller.inventory.getById({ id });
    expect(created).toMatchObject({ name: "Form Med", genericName: null, minimumStock: 30, sellableStock: 49 });
    expect(created.batches[0]).toMatchObject({ batchNumber: "FM-1", sellingPrice: "33.60" });

    // Edit round-trip: load into the form, change, save.
    const edited = { ...medicineToFormValues(created), genericName: "Paracetamol", minimumPacks: "5" };
    await caller.inventory.update({ id, data: toUpdateMedicineFields(edited) });
    expect(await caller.inventory.getById({ id })).toMatchObject({ genericName: "Paracetamol", minimumStock: 75, name: "Form Med" });
  });

  it("accepts exactly what the Add / Edit batch form sends, including a stock correction to zero", async () => {
    const caller = asUser();
    const { id } = await caller.inventory.create(toCreateMedicineInput({ ...emptyMedicineForm, name: "Batch Form Med", packSize: "10", addBatch: false }));
    const batchForm = { batchNumber: "bf-1", expiryMonth: "2031-02", mrp: "50", sellingPrice: "", purchasePrice: "35", packs: "4", loose: "6" };
    await caller.inventory.addBatch({ medicineId: id, data: toBatchFields(batchForm, 10) });

    const [batch] = (await caller.inventory.getById({ id })).batches;
    expect(batch).toMatchObject({ batchNumber: "BF-1", quantity: 46, sellingPrice: "50.00", expiryMonth: "2031-02" });

    // Shelf count found nothing left: edit the batch, clear the stock fields.
    const edited = { ...batchToFormValues(batch, 10), packs: "", loose: "" };
    await caller.inventory.updateBatch({ id: batch.id, data: toBatchFields(edited, 10) });
    const after = await caller.inventory.getById({ id });
    expect(after.batches[0].quantity).toBe(0);
    expect(after.status).toBe("OUT_OF_STOCK");
  });

  it("rejects invalid input before it reaches the service", async () => {
    const error = await trpcError(
      asUser().inventory.addBatch({
        medicineId: "x",
        data: { batchNumber: "B", expiryMonth: "2030-01", mrp: "10.00", purchasePrice: "7.00", sellingPrice: "12.00", quantity: 1 },
      }),
    );
    expect(error.code).toBe("BAD_REQUEST");
    expect(error.message).toContain("Selling price can't be more than MRP");
  });

  it("passes business errors through with their code and friendly message", async () => {
    const error = await trpcError(asUser().inventory.getById({ id: "does-not-exist" }));
    expect(error.code).toBe("NOT_FOUND");
    expect(error.message).toBe("Medicine not found.");
  });

  it("rejects callers who are not allowed", async () => {
    const stranger = createCaller({
      db,
      headers: new Headers(),
      access: { status: "denied", userId: "x", email: "stranger@gmail.com" },
    });
    expect((await trpcError(stranger.inventory.list({}))).code).toBe("FORBIDDEN");
  });
});
