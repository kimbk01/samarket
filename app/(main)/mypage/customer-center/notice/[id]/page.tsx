import { CustomerCenterBoardDetailClient } from "@/components/mypage/cs/CustomerCenterBoardDetailClient";

export default async function CustomerCenterNoticeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CustomerCenterBoardDetailClient contentType="notice" contentId={String(id ?? "")} />;
}
