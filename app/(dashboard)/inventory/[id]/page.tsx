import type { Metadata } from "next";
import { MedicineDetail } from "@/components/inventory/medicine-detail";

export const metadata: Metadata = { title: "Medicine" };

export default async function MedicinePage(props: PageProps<"/inventory/[id]">) {
  const { id } = await props.params;
  return <MedicineDetail id={id} />;
}
