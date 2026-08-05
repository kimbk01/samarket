import { Suspense } from "react";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { NoticeDetailContent } from "@/components/my/settings/NoticeDetailContent";

export default function MypageNoticeDetailPage({
  params,
}: {
  params: Promise<{ noticeId: string }>;
}) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={4} />}>
      <MypageNoticeDetailBody params={params} />
    </Suspense>
  );
}

async function MypageNoticeDetailBody({
  params,
}: {
  params: Promise<{ noticeId: string }>;
}) {
  const { noticeId } = await params;
  return (
    <div className="mx-auto max-w-lg px-4 py-4">
      <NoticeDetailContent noticeId={String(noticeId ?? "")} />
    </div>
  );
}
