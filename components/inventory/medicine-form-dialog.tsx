"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Controller, useForm, useWatch, type FieldPath } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { plural } from "@/lib/format";
import {
  emptyMedicineForm,
  GST_RATES,
  medicineFormSchema,
  medicineToFormValues,
  PACK_LABELS,
  toCreateMedicineInput,
  toUpdateMedicineFields,
  UNIT_LABELS,
  type MedicineFormValues,
} from "@/lib/medicine-form";
import { useTRPC } from "@/lib/trpc-client";

// Pack types that are sold whole: choosing one sets "units per pack" to 1.
const SOLD_WHOLE = new Set(["bottle", "tube", "sachet", "vial"]);

type EditableMedicine = Parameters<typeof medicineToFormValues>[0] & { id: string };

export type MedicineDialogMode = { type: "create" } | { type: "edit"; medicine: EditableMedicine };

export function MedicineFormDialog({
  mode,
  onOpenChange,
}: {
  mode: MedicineDialogMode | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={mode !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        {mode && (
          // Re-mount per medicine so the form starts from that medicine's values.
          <MedicineForm
            key={mode.type === "edit" ? mode.medicine.id : "create"}
            mode={mode}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function MedicineForm({ mode, onDone }: { mode: MedicineDialogMode; onDone: () => void }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const isEdit = mode.type === "edit";

  const form = useForm<MedicineFormValues>({
    resolver: zodResolver(medicineFormSchema),
    defaultValues: isEdit ? medicineToFormValues(mode.medicine) : emptyMedicineForm,
  });
  const { register, control, handleSubmit, setValue, setError, formState } = form;
  const [packLabel, packSize, addBatch, mrp] = useWatch({ control, name: ["packLabel", "packSize", "addBatch", "mrp"] });
  const isMultiUnit = Number(packSize) > 1;

  const onSuccess = async (name: string) => {
    await queryClient.invalidateQueries(trpc.inventory.pathFilter());
    toast.success(isEdit ? `${name} updated` : `${name} added`);
    onDone();
  };

  const onError = (error: { message: string; data?: { zodError?: unknown } | null }) => {
    // Duplicate barcode / batch number: show it on that field.
    if (/barcode/i.test(error.message)) return setError("barcode", { message: error.message });
    if (/batch with that number/i.test(error.message)) return setError("batchNumber", { message: error.message });
    setError("root.server", {
      message: error.data?.zodError ? "Some values are invalid. Please check the form." : error.message,
    });
  };

  const create = useMutation(trpc.inventory.create.mutationOptions({ onError }));
  const update = useMutation(trpc.inventory.update.mutationOptions({ onError }));
  const saving = create.isPending || update.isPending;

  const onSubmit = handleSubmit((values) => {
    if (mode.type === "edit") {
      update.mutate(
        { id: mode.medicine.id, data: toUpdateMedicineFields(values) },
        { onSuccess: () => onSuccess(values.name.trim()) },
      );
    } else {
      create.mutate(toCreateMedicineInput(values), { onSuccess: () => onSuccess(values.name.trim()) });
    }
  });

  const field = (name: FieldPath<MedicineFormValues>) => ({
    id: name,
    "aria-invalid": !!formState.errors[name as keyof MedicineFormValues],
    ...register(name),
  });
  const error = (name: keyof MedicineFormValues) => <FieldError errors={[formState.errors[name]]} />;
  const packWord = plural(packLabel || "pack", 2);

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <DialogHeader>
        <DialogTitle>{isEdit ? `Edit ${mode.medicine.name}` : "Add medicine"}</DialogTitle>
        <DialogDescription>
          {isEdit
            ? "Change the medicine's details. Batches and stock are edited on the medicine's page."
            : "Enter the medicine's details and, optionally, its opening stock."}
        </DialogDescription>
      </DialogHeader>

      {formState.errors.root?.server && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formState.errors.root.server.message}
        </p>
      )}

      <FieldSet>
        <FieldLegend>Medicine</FieldLegend>
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <Field className="sm:col-span-2" data-invalid={!!formState.errors.name}>
            <FieldLabel htmlFor="name">Name *</FieldLabel>
            <Input {...field("name")} placeholder="e.g. Dolo 650" autoFocus />
            {error("name")}
          </Field>
          <Field data-invalid={!!formState.errors.genericName}>
            <FieldLabel htmlFor="genericName">Generic name</FieldLabel>
            <Input {...field("genericName")} placeholder="e.g. Paracetamol 650 mg" />
            {error("genericName")}
          </Field>
          <Field data-invalid={!!formState.errors.manufacturer}>
            <FieldLabel htmlFor="manufacturer">Manufacturer</FieldLabel>
            <Input {...field("manufacturer")} placeholder="e.g. Micro Labs" />
            {error("manufacturer")}
          </Field>
          <Field data-invalid={!!formState.errors.category}>
            <FieldLabel htmlFor="category">Category</FieldLabel>
            <Input {...field("category")} placeholder="e.g. Analgesic" />
            {error("category")}
          </Field>
          <Field data-invalid={!!formState.errors.barcode}>
            <FieldLabel htmlFor="barcode">Barcode</FieldLabel>
            <Input {...field("barcode")} placeholder="Scan or type" inputMode="numeric" />
            {error("barcode")}
          </Field>
          <Field data-invalid={!!formState.errors.gstRate}>
            <FieldLabel htmlFor="gstRate">GST rate *</FieldLabel>
            <Controller
              control={control}
              name="gstRate"
              render={({ field: { value, onChange } }) => (
                <Select value={value} onValueChange={onChange}>
                  <SelectTrigger id="gstRate" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GST_RATES.map((rate) => (
                      <SelectItem key={rate} value={rate}>
                        {rate}%
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldDescription>Prices are GST-inclusive (MRP).</FieldDescription>
            {error("gstRate")}
          </Field>
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend>Packaging</FieldLegend>
        <FieldGroup className="grid gap-4 sm:grid-cols-4">
          <Field>
            <FieldLabel htmlFor="packLabel">Pack type</FieldLabel>
            <Controller
              control={control}
              name="packLabel"
              render={({ field: { value, onChange } }) => (
                <Select
                  value={value}
                  onValueChange={(next) => {
                    onChange(next);
                    if (SOLD_WHOLE.has(next)) setValue("packSize", "1");
                    else if (packSize === "1") setValue("packSize", "10");
                  }}
                >
                  <SelectTrigger id="packLabel" className="w-full capitalize">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PACK_LABELS.map((label) => (
                      <SelectItem key={label} value={label} className="capitalize">
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field data-invalid={!!formState.errors.packSize}>
            <FieldLabel htmlFor="packSize">Units per {packLabel} *</FieldLabel>
            <Input {...field("packSize")} inputMode="numeric" />
            {error("packSize")}
          </Field>
          {isMultiUnit && (
            <Field>
              <FieldLabel htmlFor="unitLabel">Unit</FieldLabel>
              <Controller
                control={control}
                name="unitLabel"
                render={({ field: { value, onChange } }) => (
                  <Select value={value} onValueChange={onChange}>
                    <SelectTrigger id="unitLabel" className="w-full capitalize">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNIT_LABELS.map((label) => (
                        <SelectItem key={label} value={label} className="capitalize">
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          )}
          <Field data-invalid={!!formState.errors.minimumPacks}>
            <FieldLabel htmlFor="minimumPacks">Low-stock alert below</FieldLabel>
            <Input {...field("minimumPacks")} inputMode="numeric" />
            <FieldDescription>In {packWord}. 0 = no alert.</FieldDescription>
            {error("minimumPacks")}
          </Field>
        </FieldGroup>
        {isEdit && (
          <FieldDescription>
            Stock is counted in single units, so changing the pack size doesn&apos;t change how many units you have.
          </FieldDescription>
        )}
      </FieldSet>

      {!isEdit && (
        <FieldSet>
          <div className="flex items-center justify-between gap-4">
            <FieldLegend className="mb-0">Opening stock</FieldLegend>
            <Controller
              control={control}
              name="addBatch"
              render={({ field: { value, onChange } }) => (
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={value} onCheckedChange={onChange} />
                  Add the first batch now
                </label>
              )}
            />
          </div>
          {addBatch && (
            <FieldGroup className="grid gap-4 sm:grid-cols-3">
              <Field data-invalid={!!formState.errors.batchNumber}>
                <FieldLabel htmlFor="batchNumber">Batch number *</FieldLabel>
                <Input {...field("batchNumber")} className="uppercase" />
                {error("batchNumber")}
              </Field>
              <Field data-invalid={!!formState.errors.expiryMonth}>
                <FieldLabel htmlFor="expiryMonth">Expiry (month) *</FieldLabel>
                <Input {...field("expiryMonth")} type="month" />
                {error("expiryMonth")}
              </Field>
              <Field data-invalid={!!formState.errors.mrp}>
                <FieldLabel htmlFor="mrp">MRP per {packLabel} (₹) *</FieldLabel>
                <Input {...field("mrp")} inputMode="decimal" placeholder="0.00" />
                {error("mrp")}
              </Field>
              <Field data-invalid={!!formState.errors.sellingPrice}>
                <FieldLabel htmlFor="sellingPrice">Selling price per {packLabel} (₹)</FieldLabel>
                <Input {...field("sellingPrice")} inputMode="decimal" placeholder={mrp ? `${mrp} (MRP)` : "Same as MRP"} />
                {error("sellingPrice")}
              </Field>
              <Field data-invalid={!!formState.errors.purchasePrice}>
                <FieldLabel htmlFor="purchasePrice">Purchase price per {packLabel} (₹) *</FieldLabel>
                <Input {...field("purchasePrice")} inputMode="decimal" placeholder="0.00" />
                {error("purchasePrice")}
              </Field>
              <div className="flex gap-2">
                <Field data-invalid={!!formState.errors.packs}>
                  <FieldLabel htmlFor="packs" className="capitalize">
                    {packWord} *
                  </FieldLabel>
                  <Input {...field("packs")} inputMode="numeric" />
                  {error("packs")}
                </Field>
                {isMultiUnit && (
                  <Field data-invalid={!!formState.errors.loose}>
                    <FieldLabel htmlFor="loose">+ Loose</FieldLabel>
                    <Input {...field("loose")} inputMode="numeric" placeholder="0" />
                    {error("loose")}
                  </Field>
                )}
              </div>
            </FieldGroup>
          )}
        </FieldSet>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="animate-spin" />}
          {isEdit ? "Save changes" : "Add medicine"}
        </Button>
      </DialogFooter>
    </form>
  );
}
