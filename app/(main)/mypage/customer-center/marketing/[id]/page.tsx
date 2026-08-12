import { CustomerCenterBoardDetailClient } from "@/components/mypage/cs/CustomerCenterBoardDetailClient";

export default async function CustomerCenterMarketingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CustomerCenterBoardDetailClient contentType="marketing" contentId={String(id ?? "")} />;
}
