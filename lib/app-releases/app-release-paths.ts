/** 업데이트 내역 페이지 경로 (앱 업데이트 v2) — 클라이언트·서버 공용. */
import type { AppReleasePlatform } from "@/lib/app-releases/app-release-version";

// 버전 정보(`/mypage/section/settings/version`, 동적 경로) 아래 폴더를 만들면 그 화면이 가려질 수 있어 별도 주소.
export const APP_RELEASE_HISTORY_HREF = "/mypage/app-updates";

/** 알림 목적지 — 그 버전 줄을 강조해서 연다. */
export function buildAppReleaseHistoryPath(platform: AppReleasePlatform, version: string): string {
  const sp = new URLSearchParams({ platform, v: version });
  return `${APP_RELEASE_HISTORY_HREF}?${sp.toString()}`;
}
