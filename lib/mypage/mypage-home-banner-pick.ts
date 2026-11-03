import type { MyPageBannerRow } from "@/lib/my/types";

/**
 * 내정보 홈 CMS 배너 — 고객 화면 선택 규칙 (광고 최종 점검 · 마이 CMS 배너).
 * - 서버는 노출 조건(활성·기간)에 맞는 배너를 순서대로 여러 건 내려 준다(`MYPAGE_HOME_BANNER_FETCH_LIMIT`).
 * - 앱은 그중 닫지 않은 첫 배너 1개만 그린다. 닫으면 다음 배너가 나온다.
 */
export const MYPAGE_HOME_BANNER_FETCH_LIMIT = 10;

/** 모바일 폭 기준 — 이 폭 이상은 데스크톱 이미지 (콘텐츠 열 최대 폭 768px 과 같다). */
export const MYPAGE_BANNER_DESKTOP_MIN_WIDTH_PX = 768;

/** 닫지 않은 첫 배너. 닫을 수 없는 배너(`dismissible=false`)는 닫힘 기록과 상관없이 보인다. */
export function pickMypageHomeBanner(
  banners: readonly MyPageBannerRow[],
  isDismissed: (bannerId: string) => boolean
): MyPageBannerRow | null {
  for (const b of banners) {
    if (!b?.id) continue;
    if (b.dismissible && isDismissed(b.id)) continue;
    return b;
  }
  return null;
}

/** 이미지 주소 — 모바일 폭은 모바일 이미지(없으면 기본 이미지), 넓은 화면은 기본 이미지(없으면 모바일 이미지). */
export function resolveMypageBannerImageSources(
  banner: Pick<MyPageBannerRow, "image_url" | "mobile_image_url">
): { mobileSrc: string; desktopSrc: string } | null {
  const desktop = String(banner.image_url ?? "").trim();
  const mobile = String(banner.mobile_image_url ?? "").trim();
  if (!desktop && !mobile) return null;
  return { mobileSrc: mobile || desktop, desktopSrc: desktop || mobile };
}
