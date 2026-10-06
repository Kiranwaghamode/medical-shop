"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { cn } from "cn";
import { ArrowLeft, PackageX, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { BatchFormDialog, type BatchDialogMode } from "@/components/inventory/batch-form-dialog";
import { MedicineActions } from "@/components/inventory/medicine-actions";
import { MedicineFormDialog, type MedicineDialogMode } from "@/components/inventory/medicine-form-dialog";
import { StockStatusBadges } from "@/components/inventory/stock-status-badges";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatExpiry, formatINR, formatPacks, formatPercent, formatUnits, plural } from "@/lib/format";
import { useTRPC } from "@/lib/trpc-client";
import type { AppRouter } from "@/server/root";

type Medicine = inferRouterOutputs<AppRouter>["inventory"]["getById"];
type Batch = Medicine["batches"][number];

export function MedicineDetail({ id }: { id: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const query = useQuery(trpc.inventory.getById.queryOptions({ id }));
  const [medicineDialog, setMedicineDialog] = useState<MedicineDialogMode | null>(null);
  const [batchDialog, setBatchDialog] = useState<BatchDialogMode | null>(null);

  if (query.isPending) return <DetailSkeleton />;

  if (query.isError) {
    const notFound = query.error.data?.code === "NOT_FOUND";
    return (
      <div className="flex flex-col items-center gap-3 p-10 text-center">
        <PackageX className="size-8 text-muted-foreground" />
        <p className={notFound ? "text-muted-foreground" : "text-destructive"}>
          {notFound ? "This medicine doesn't exist or has been deleted." : `Couldn't load the medicine: ${query.error.message}`}
        </p>
        <Button asChild variant="outline">
          <Link href="/inventory">Back to inventory</Link>
        </Button>
      </div>
    );
  }

  const medicine = query.data;
  const minimumPacks = Math.ceil(medicine.minimumStock / medicine.packSize);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2 self-start text-muted-foreground">
          <Link href="/inventory">
            <ArrowLeft /> Inventory
          </Link>
        </Button>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <h2 className="font-heading text-2xl font-semibold">{medicine.name}</h2>
            {medicine.genericName && <p className="text-muted-foreground">{medicine.genericName}</p>}
            <StockStatusBadges {...medicine} />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setMedicineDialog({ type: "edit", medicine })}>
              <Pencil /> Edit details
            </Button>
            <MedicineActions
              medicine={medicine}
              onEdit={() => setMedicineDialog({ type: "edit", medicine })}
              onDeleted={() => router.push("/inventory")}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard title="Sellable stock" value={formatUnits(medicine.sellableStock, medicine.unitLabel)}>
          {medicine.packSize > 1 && formatPacks(medicine.sellableStock, medicine)}
        </SummaryCard>
        <SummaryCard
          title="Expired stock"
          value={formatUnits(medicine.expiredStock, medicine.unitLabel)}
          className={medicine.expiredStock > 0 ? "text-red-700 dark:text-red-400" : undefined}
        >
          {medicine.expiredStock > 0 ? "Remove from the shelf — it can't be sold." : "None"}
        </SummaryCard>
        <SummaryCard
          title="Nearest expiry"
          value={medicine.nearestExpiry ? formatExpiry(medicine.nearestExpiry) : "—"}
          className={medicine.expiringSoonStock > 0 ? "text-orange-700 dark:text-orange-400" : undefined}
        >
          {medicine.expiringSoonStock > 0
            ? `${formatUnits(medicine.expiringSoonStock, medicine.unitLabel)} expiring within 30 days`
            : "Of stock that can be sold"}
        </SummaryCard>
        <SummaryCard
          title="Low-stock alert"
          value={minimumPacks > 0 ? `Below ${minimumPacks} ${plural(medicine.packLabel, minimumPacks)}` : "Off"}
        >
          {minimumPacks > 0 && medicine.packSize > 1 && `${formatUnits(medicine.minimumStock, medicine.unitLabel)}`}
        </SummaryCard>
      </div>

      <dl className="grid gap-x-8 gap-y-3 rounded-lg border p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <Detail label="Pack">
          {medicine.packSize > 1
            ? `${medicine.packSize} ${plural(medicine.unitLabel, medicine.packSize)} per ${medicine.packLabel}`
            : `Sold by the ${medicine.packLabel}`}
        </Detail>
        <Detail label="GST">{formatPercent(medicine.gstRate)} (included in prices)</Detail>
        <Detail label="Barcode">{medicine.barcode ?? "—"}</Detail>
        <Detail label="Manufacturer">{medicine.manufacturer ?? "—"}</Detail>
        <Detail label="Category">{medicine.category ?? "—"}</Detail>
        <Detail label="Sales history">{medicine.hasSales ? "Has been sold" : "Never sold"}</Detail>
      </dl>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <CardTitle>Batches</CardTitle>
            <CardDescription>Earliest expiry first — that&apos;s the order they will be sold in.</CardDescription>
          </div>
          <Button onClick={() => setBatchDialog({ type: "create" })}>
            <Plus /> Add batch
          </Button>
        </CardHeader>
        <CardContent>
          {medicine.batches.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground">No batches yet. Add one to record stock.</p>
          ) : (
            <BatchTable medicine={medicine} onEdit={(batch) => setBatchDialog({ type: "edit", batch })} />
          )}
        </CardContent>
      </Card>

      <MedicineFormDialog mode={medicineDialog} onOpenChange={(open) => !open && setMedicineDialog(null)} />
      <BatchFormDialog medicine={medicine} mode={batchDialog} onOpenChange={(open) => !open && setBatchDialog(null)} />
    </div>
  );
}

function BatchTable({ medicine, onEdit }: { medicine: Medicine; onEdit: (batch: Batch) => void }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [toDelete, setToDelete] = useState<Batch | null>(null);

  const remove = useMutation(
    trpc.inventory.deleteBatch.mutationOptions({
      onSuccess: async () => {
        toast.success(`Batch ${toDelete?.batchNumber} deleted`);
        setToDelete(null);
        await queryClient.invalidateQueries(trpc.inventory.pathFilter());
      },
      onError: (error) => {
        setToDelete(null);
        toast.error(error.message);
      },
    }),
  );

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Batch</TableHead>
            <TableHead>Expiry</TableHead>
            <TableHead>Stock</TableHead>
            <TableHead className="text-right">MRP</TableHead>
            <TableHead className="text-right">Selling</TableHead>
            <TableHead className="hidden lg:table-cell text-right">Purchase</TableHead>
            <TableHead className="w-24">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {medicine.batches.map((batch) => (
            <TableRow key={batch.id} className={cn(batch.isExpired && "bg-red-50/60 dark:bg-red-950/20")}>
              <TableCell className="font-medium">{batch.batchNumber}</TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-1.5">
                  {formatExpiry(batch.expiryDate)}
                  {batch.isExpired && <Badge className="bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">Expired</Badge>}
                  {batch.isExpiringSoon && (
                    <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300">Expiring soon</Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className={cn("tabular-nums", batch.quantity === 0 && "text-muted-foreground")}>
                <div>{formatUnits(batch.quantity, medicine.unitLabel)}</div>
                {medicine.packSize > 1 && batch.quantity > 0 && (
                  <div className="text-xs text-muted-foreground">{formatPacks(batch.quantity, medicine)}</div>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatINR(batch.mrp)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatINR(batch.sellingPrice)}</TableCell>
              <TableCell className="hidden lg:table-cell text-right tabular-nums text-muted-foreground">
                {formatINR(batch.purchasePrice)}
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="icon" aria-label={`Edit batch ${batch.batchNumber}`} onClick={() => onEdit(batch)}>
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete batch ${batch.batchNumber}`}
                    onClick={() => setToDelete(batch)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <AlertDialog open={toDelete !== null} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete batch {toDelete?.batchNumber}?</AlertDialogTitle>
            <AlertDialogDescription>
              Use this for a batch entered by mistake. A batch that has been sold from can&apos;t be deleted — edit it and
              set its stock to 0 instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={remove.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (toDelete) remove.mutate({ id: toDelete.id });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function SummaryCard({
  title,
  value,
  className,
  children,
}: {
  title: string;
  value: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className={cn("text-xl tabular-nums", className)}>{value}</CardTitle>
      </CardHeader>
      {children && <CardContent className="text-xs text-muted-foreground">{children}</CardContent>}
    </Card>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-6 w-24" />
      <Skeleton className="h-9 w-64" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
