import { redirect } from "next/navigation";
import { PLATFORM_POPUP_ADMIN_REQUEST_ROUTES } from "@/lib/platform-popup/platform-popup-owner-routes";

/**
 * 오너 팝업 신청 목록 — 광고 작업 「팝업」 종류로 보낸다 (신청 전체 상태 · 서버 페이지).
 * 이 정적 경로가 없으면 `requests` 가 `[campaignId]` 로 해석되어 캠페인 편집 화면이 uuid 오류를 냈다.
 */
export default function AdminPlatformPopupRequestsIndexPage() {
  redirect(PLATFORM_POPUP_ADMIN_REQUEST_ROUTES.queue);
}
