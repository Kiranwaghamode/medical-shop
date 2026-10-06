import type { Metadata } from "next";
import { PosLoader } from "@/components/pos/pos-loader";

export const metadata: Metadata = { title: "New Sale" };

export default function NewSalePage() {
  return <PosLoader />;
}
