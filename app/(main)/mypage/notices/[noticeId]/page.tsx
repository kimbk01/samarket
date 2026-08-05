import { NoticeDetailPageClient } from "@/components/my/settings/NoticeDetailPageClient";

export default async function MypageNoticeDetailPage({
  params,
}: {
  params: Promise<{ noticeId: string }>;
}) {
  const { noticeId } = await params;
  return <NoticeDetailPageClient noticeId={String(noticeId ?? "")} />;
}
