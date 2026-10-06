"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useForm, useWatch, type FieldPath } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { batchFormSchema, batchToFormValues, emptyBatchForm, toBatchFields, type BatchFormValues } from "@/lib/batch-form";
import { plural } from "@/lib/format";
import { useTRPC } from "@/lib/trpc-client";

type Medicine = { id: string; name: string; packSize: number; unitLabel: string; packLabel: string };
type EditableBatch = Parameters<typeof batchToFormValues>[0] & { id: string };

export type BatchDialogMode = { type: "create" } | { type: "edit"; batch: EditableBatch };

export function BatchFormDialog({
  medicine,
  mode,
  onOpenChange,
}: {
  medicine: Medicine;
  mode: BatchDialogMode | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={mode !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        {mode && (
          <BatchForm
            key={mode.type === "edit" ? mode.batch.id : "create"}
            medicine={medicine}
            mode={mode}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function BatchForm({ medicine, mode, onDone }: { medicine: Medicine; mode: BatchDialogMode; onDone: () => void }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const isEdit = mode.type === "edit";
  const { packSize, packLabel, unitLabel } = medicine;

  const { register, control, handleSubmit, setError, formState } = useForm<BatchFormValues>({
    resolver: zodResolver(batchFormSchema(packSize)),
    defaultValues: isEdit ? batchToFormValues(mode.batch, packSize) : emptyBatchForm,
  });
  const mrp = useWatch({ control, name: "mrp" });

  const onSuccess = async (batchNumber: string) => {
    await queryClient.invalidateQueries(trpc.inventory.pathFilter());
    toast.success(isEdit ? `Batch ${batchNumber} updated` : `Batch ${batchNumber} added`);
    onDone();
  };
  const onError = (error: { message: string; data?: { zodError?: unknown } | null }) => {
    if (/batch with that number/i.test(error.message)) return setError("batchNumber", { message: error.message });
    setError("root.server", {
      message: error.data?.zodError ? "Some values are invalid. Please check the form." : error.message,
    });
  };

  const add = useMutation(trpc.inventory.addBatch.mutationOptions({ onError }));
  const update = useMutation(trpc.inventory.updateBatch.mutationOptions({ onError }));
  const saving = add.isPending || update.isPending;

  const onSubmit = handleSubmit((values) => {
    const data = toBatchFields(values, packSize);
    const done = { onSuccess: () => onSuccess(values.batchNumber.trim().toUpperCase()) };
    if (mode.type === "edit") update.mutate({ id: mode.batch.id, data }, done);
    else add.mutate({ medicineId: medicine.id, data }, done);
  });

  const field = (name: FieldPath<BatchFormValues>) => ({
    id: name,
    "aria-invalid": !!formState.errors[name],
    ...register(name),
  });
  const error = (name: keyof BatchFormValues) => <FieldError errors={[formState.errors[name]]} />;
  const packWord = plural(packLabel, 2);

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <DialogHeader>
        <DialogTitle>
          {isEdit ? `Edit batch ${mode.batch.batchNumber}` : "Add batch"} — {medicine.name}
        </DialogTitle>
        <DialogDescription>
          {isEdit
            ? "Correct the batch details or its stock. To record a stock count, enter what is on the shelf now."
            : `Prices are per ${packLabel}, as printed on the pack.`}
        </DialogDescription>
      </DialogHeader>

      {formState.errors.root?.server && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formState.errors.root.server.message}
        </p>
      )}

      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <Field data-invalid={!!formState.errors.batchNumber}>
          <FieldLabel htmlFor="batchNumber">Batch number *</FieldLabel>
          <Input {...field("batchNumber")} className="uppercase" autoFocus={!isEdit} />
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
              {packWord}
            </FieldLabel>
            <Input {...field("packs")} inputMode="numeric" placeholder="0" autoFocus={isEdit} />
            {error("packs")}
          </Field>
          {packSize > 1 && (
            <Field data-invalid={!!formState.errors.loose}>
              <FieldLabel htmlFor="loose">+ Loose {plural(unitLabel, 2)}</FieldLabel>
              <Input {...field("loose")} inputMode="numeric" placeholder="0" />
              {error("loose")}
            </Field>
          )}
        </div>
      </FieldGroup>
      {packSize > 1 && (
        <FieldDescription>
          1 {packLabel} = {packSize} {plural(unitLabel, packSize)}. Stock is stored in {plural(unitLabel, 2)} so loose
          sales are exact.
        </FieldDescription>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="animate-spin" />}
          {isEdit ? "Save batch" : "Add batch"}
        </Button>
      </DialogFooter>
    </form>
  );
}
