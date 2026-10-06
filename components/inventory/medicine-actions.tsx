"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ban, MoreHorizontal, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTRPC } from "@/lib/trpc-client";

type Confirm = "deactivate" | "delete" | null;

/** Row menu: Edit, Deactivate / Reactivate, Delete (with confirmation). */
export function MedicineActions({
  medicine,
  onEdit,
  onDeleted,
}: {
  medicine: { id: string; name: string; isActive: boolean };
  onEdit: () => void;
  onDeleted?: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState<Confirm>(null);

  const refresh = () => queryClient.invalidateQueries(trpc.inventory.pathFilter());
  const onError = (error: { message: string }) => toast.error(error.message);

  const setActive = useMutation(
    trpc.inventory.setActive.mutationOptions({
      onSuccess: async ({ isActive }) => {
        await refresh();
        toast.success(isActive ? `${medicine.name} is active again` : `${medicine.name} deactivated`);
        setConfirm(null);
      },
      onError,
    }),
  );

  const remove = useMutation(
    trpc.inventory.delete.mutationOptions({
      onSuccess: async () => {
        setConfirm(null);
        toast.success(`${medicine.name} deleted`);
        onDeleted?.();
        await refresh();
      },
      onError: (error) => {
        setConfirm(null);
        onError(error);
      },
    }),
  );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for ${medicine.name}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil /> Edit
          </DropdownMenuItem>
          {medicine.isActive ? (
            <DropdownMenuItem onSelect={() => setConfirm("deactivate")}>
              <Ban /> Deactivate
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => setActive.mutate({ id: medicine.id, isActive: true })}>
              <RotateCcw /> Reactivate
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirm("delete")}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          {confirm === "deactivate" ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Deactivate {medicine.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  It will be hidden from sales and the main inventory list. Its batches and past sales are kept, and you
                  can reactivate it any time from the Inactive tab.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={setActive.isPending}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={setActive.isPending}
                  onClick={(event) => {
                    event.preventDefault(); // keep the dialog open until the request finishes
                    setActive.mutate({ id: medicine.id, isActive: false });
                  }}
                >
                  Deactivate
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {medicine.name} permanently?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes the medicine and all its batches and can&apos;t be undone. Only medicines that have never
                  been sold can be deleted — otherwise, deactivate it instead.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={remove.isPending}
                  onClick={(event) => {
                    event.preventDefault();
                    remove.mutate({ id: medicine.id });
                  }}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
