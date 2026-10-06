import { requireAllowedUser } from "@/lib/auth";

// Every page in the (dashboard) group requires a signed-in user on the ALLOWED_EMAILS list.
// Data is protected separately by tRPC's protectedProcedure.
export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  await requireAllowedUser();
  return children;
}
