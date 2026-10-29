import { redirect } from "next/navigation";

/**
 * 잔여 경로 — `/admin/banners` 가 다루던 원장은 마이페이지 배너(`my_page_banners`)다.
 * Admin IA R1 (감사 AD-03): 예전에는 숨김 처리된 배달 광고 관리로 보내 엉뚱한 화면이 열렸다.
 * 배너 전체 현황은 광고·배너 › 배너 현황(`/admin/advertising/banners`).
 */
export default function AdminBannersPage() {
  redirect("/admin/my/banners");
}
