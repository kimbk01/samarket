import { AdminSupportPage } from "@/components/admin/support/AdminSupportPage";

export default async function AdminSupportCaseRoutePage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  return <AdminSupportPage initialCaseId={caseId} />;
}
