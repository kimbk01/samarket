import type { AdminBanner } from "@/lib/types/admin-banner";

/**
 * 마이페이지 배너 삭제 정책 (감사 AD-01 · Owner J-4) — 화면·서버가 같은 판정을 쓴다.
 * 노출된 적 없는 초안만 실제 삭제, 그 외는 숨김 보관.
 */
export function isAdminBannerHardDeletable(banner: Pick<AdminBanner, "status" | "impressionCount">): boolean {
  return banner.status === "draft" && banner.impressionCount === 0;
}
