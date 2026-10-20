import { CustomerCenterBoardDetailClient } from "@/components/mypage/cs/CustomerCenterBoardDetailClient";

/**
 * 벨·푸시 공지 딥링크 `/mypage/notices/{id}` — 경로 유지(고객센터 SSOT · 최종 설계 X15/K11),
 * 게시판 상세와 **같은 컴포넌트**로 렌더(리다이렉트 없음). 게시판 종류는 상세 응답으로 정한다.
 */
export default async function MypageNoticeDetailPage({
  params,
}: {
  params: Promise<{ noticeId: string }>;
}) {
  const { noticeId } = await params;
  return <CustomerCenterBoardDetailClient contentId={String(noticeId ?? "")} />;
}
