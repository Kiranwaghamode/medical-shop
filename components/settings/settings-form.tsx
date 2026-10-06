"use client";

import { SignOutButton } from "@clerk/nextjs";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { Controller, useForm, type FieldPath } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Segmented } from "@/components/pos/segmented";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useTRPC } from "@/lib/trpc-client";
import { shopSettingsSchema, type ShopSettingsInput } from "@/lib/validations";
import type { ShopSettings } from "@/services/settings.service";

type FormValues = z.input<typeof shopSettingsSchema>;

const toFormValues = (settings: ShopSettings): FormValues => ({
  name: settings.name,
  address: settings.address ?? "",
  phone: settings.phone ?? "",
  gstin: settings.gstin ?? "",
  drugLicenseNumber: settings.drugLicenseNumber ?? "",
  billFooter: settings.billFooter ?? "",
  billPaperSize: settings.billPaperSize,
  autoPrint: settings.autoPrint,
});

export function SettingsForm({ initial, email }: { initial: ShopSettings; email: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();

  // Third type = values after the schema's transforms (blanks → null); we still send the raw values.
  const { register, control, handleSubmit, getValues, reset, setError, formState } = useForm<FormValues, unknown, ShopSettingsInput>({
    resolver: zodResolver(shopSettingsSchema),
    defaultValues: toFormValues(initial),
  });

  const save = useMutation(
    trpc.settings.update.mutationOptions({
      onSuccess: async (saved) => {
        reset(toFormValues(saved));
        toast.success("Settings saved");
        await queryClient.invalidateQueries(trpc.settings.pathFilter());
        // The header shows the shop name; reload the server-rendered layout.
        router.refresh();
      },
      onError: (error) => setError("root.server", { message: error.data?.zodError ? "Some values are invalid." : error.message }),
    }),
  );

  // Validate with the shared schema, then send the raw values; the server trims and re-validates them.
  const onSubmit = handleSubmit(() => save.mutate(getValues()));

  const field = (name: FieldPath<FormValues>) => ({ id: name, "aria-invalid": !!formState.errors[name], ...register(name) });
  const error = (name: keyof FormValues) => <FieldError errors={[formState.errors[name]]} />;

  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-3xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Shop details</CardTitle>
          <CardDescription>Printed at the top of every bill.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field className="sm:col-span-2" data-invalid={!!formState.errors.name}>
              <FieldLabel htmlFor="name">Shop name *</FieldLabel>
              <Input {...field("name")} placeholder="e.g. ABC Medical Store" />
              {error("name")}
            </Field>
            <Field className="sm:col-span-2" data-invalid={!!formState.errors.address}>
              <FieldLabel htmlFor="address">Address</FieldLabel>
              <Textarea {...field("address")} rows={2} placeholder={"e.g. 12, MG Road\nBelagavi, Karnataka 590001"} />
              {error("address")}
            </Field>
            <Field data-invalid={!!formState.errors.phone}>
              <FieldLabel htmlFor="phone">Phone</FieldLabel>
              <Input {...field("phone")} inputMode="tel" placeholder="e.g. 0831-2401234, 98765 43210" />
              {error("phone")}
            </Field>
            <Field data-invalid={!!formState.errors.gstin}>
              <FieldLabel htmlFor="gstin">GSTIN</FieldLabel>
              <Input {...field("gstin")} className="uppercase" placeholder="e.g. 29ABCDE1234F1Z5" maxLength={15} />
              <FieldDescription>With a GSTIN the bill is titled “Tax Invoice”.</FieldDescription>
              {error("gstin")}
            </Field>
            <Field data-invalid={!!formState.errors.drugLicenseNumber}>
              <FieldLabel htmlFor="drugLicenseNumber">Drug Licence No.</FieldLabel>
              <Input {...field("drugLicenseNumber")} placeholder="e.g. KA-BGM-20B-12345, 21B-12346" />
              {error("drugLicenseNumber")}
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bills and printing</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup className="gap-5">
            <Field data-invalid={!!formState.errors.billFooter}>
              <FieldLabel htmlFor="billFooter">Bill footer</FieldLabel>
              <Textarea {...field("billFooter")} rows={2} placeholder="e.g. Goods once sold will not be taken back." />
              <FieldDescription>Printed above “Thank you! Get well soon.”</FieldDescription>
              {error("billFooter")}
            </Field>
            <Field>
              <FieldLabel>Paper size</FieldLabel>
              <Controller
                control={control}
                name="billPaperSize"
                render={({ field: { value, onChange } }) => (
                  <Segmented
                    label="Paper size"
                    value={value}
                    onChange={onChange}
                    options={[
                      { value: "A5", label: "A5 (half sheet)" },
                      { value: "A4", label: "A4 (full sheet)" },
                    ]}
                  />
                )}
              />
              <FieldDescription>The default for every bill; you can still switch for a single print.</FieldDescription>
            </Field>
            <Controller
              control={control}
              name="autoPrint"
              render={({ field: { value, onChange } }) => (
                <label className="flex items-start gap-3">
                  <Switch checked={value} onCheckedChange={onChange} className="mt-0.5" />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">Print automatically after each sale</span>
                    <span className="text-sm text-muted-foreground">Opens the print dialog as soon as the bill appears.</span>
                  </span>
                </label>
              )}
            />
          </FieldGroup>
        </CardContent>
        <CardFooter className="flex items-center justify-between gap-4">
          <p role="alert" className="text-sm text-destructive">
            {formState.errors.root?.server?.message}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={!formState.isDirty || save.isPending} onClick={() => reset()}>
              Discard changes
            </Button>
            <Button type="submit" disabled={!formState.isDirty || save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" />}
              Save settings
            </Button>
          </div>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>
            Signed in with Google as <span className="font-medium text-foreground">{email}</span>. Who can sign in is
            controlled by <code>ALLOWED_EMAILS</code>.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <SignOutButton redirectUrl="/login">
            <Button type="button" variant="outline">
              <LogOut /> Sign out
            </Button>
          </SignOutButton>
        </CardFooter>
      </Card>
    </form>
  );
}
