import { AdminMemberBenefitDetailPage } from "@/components/admin/member-benefits/AdminMemberBenefitDetailPage";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminMemberBenefitDetailRoute({
  params,
}: PageProps) {
  const { id } = await params;
  return <AdminMemberBenefitDetailPage policyId={id} />;
}
