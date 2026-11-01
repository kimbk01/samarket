import { CustomerCenterBoardDetailClient } from "@/components/mypage/cs/CustomerCenterBoardDetailClient";

export default async function CustomerCenterUpdateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CustomerCenterBoardDetailClient contentType="update" contentId={String(id ?? "")} />;
}
