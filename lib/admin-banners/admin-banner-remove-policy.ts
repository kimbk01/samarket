import type { AdminBanner } from "@/lib/types/admin-banner";

/**
 * 마이페이지 배너 삭제 정책 (감사 AD-01 · Owner J-4) — 화면·서버가 같은 판정을 쓴다.
 * 게시한 적 없는 초안만 실제 삭제, 그 외는 숨김 보관.
 *
 * 광고 최종 점검: 고객 화면은 노출·클릭 수를 쌓지 않는다(항상 0). 그래서 「노출 0」 조건만으로는 게시했다가
 * 초안으로 되돌린 배너도 「노출된 적 없는 초안」이 되어 완전히 지워졌다 → 게시 사실(`everPublished`)로 판정한다.
 * `everPublished` 를 모르면(undefined) 게시된 것으로 보고 지우지 않는다.
 */
export function isAdminBannerHardDeletable(
  banner: Pick<AdminBanner, "status" | "impressionCount"> &
    Partial<Pick<AdminBanner, "clickCount" | "everPublished">>
): boolean {
  return (
    banner.status === "draft" &&
    banner.everPublished === false &&
    banner.impressionCount === 0 &&
    (banner.clickCount ?? 0) === 0
  );
}

/** 감사 기록(`audit_logs`)에서 게시 이력으로 보는 행 — 생성·수정 전후 상태 중 하나라도 「active」. */
export const ADMIN_BANNER_PUBLISHED_AUDIT_ACTIONS = ["banner.create", "banner.update"] as const;
export const ADMIN_BANNER_PUBLISHED_AUDIT_OR = "after_json->>status.eq.active,before_json->>status.eq.active";
/** 변경 기록(`admin_banner_change_logs`)에서 게시 이력으로 보는 행 */
export const ADMIN_BANNER_PUBLISHED_CHANGE_LOG_ACTION = "activate" as const;
