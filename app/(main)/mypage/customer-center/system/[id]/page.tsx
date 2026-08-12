import { CustomerCenterBoardDetailClient } from "@/components/mypage/cs/CustomerCenterBoardDetailClient";

export default async function CustomerCenterSystemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CustomerCenterBoardDetailClient contentType="system" contentId={String(id ?? "")} />;
}
