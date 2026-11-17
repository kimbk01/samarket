import {
  resolveAudienceBanners,
  resolveVisibleHomeSections,
  type HomeLayoutConfig,
} from "@/lib/home/home-layout-contract";

/** 서버 HTML 에 미리 받기를 거는 배너 그림 최대 수 */
export const HOME_BANNER_PRELOAD_MAX = 4;

/**
 * 앱 진입 실기 F3-b — 첫 화면 배너 그림을 서버 HTML 에서 미리 받을 주소 목록.
 *
 * 첫 화면에 보일 배너는 클라이언트가 고른다(`useHomeRotation` · 새 실행 = 지난번 다음 배너, 회원/비회원 대상).
 * 서버는 어느 배너가 뽑힐지·회원인지 모르므로, 홈에 배너 칸이 보이는 대상(회원·비회원)의 후보 배너 그림을
 * 어드민 순서로 최대 `HOME_BANNER_PRELOAD_MAX` 개까지 겹침 없이 준다. `<img src>` 와 같은 주소 문자열 그대로.
 */
export function resolveHomeAboveFoldBannerImageUrls(layout: HomeLayoutConfig): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const isGuest of [false, true]) {
    if (!resolveVisibleHomeSections(layout, isGuest).includes("banner")) continue;
    for (const b of resolveAudienceBanners(layout, isGuest)) {
      const url = String(b.imageUrl ?? "").trim();
      if (!url || seen.has(url)) continue;
      seen.add(url);
      urls.push(url);
    }
  }
  return urls.slice(0, HOME_BANNER_PRELOAD_MAX);
}
