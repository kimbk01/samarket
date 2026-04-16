/**
 * Next.js **개발 서버** 전용 판별 (`npm run dev` 등으로 번들이 `development` 일 때).
 *
 * - `next build` + `next start`(로컬 포함) 는 `production` 번들 → 여기서는 false.
 * - 목적: dev 에서만 `router.prefetch`·백그라운드 피드 워밍 등이 **온디맨드 컴파일·HMR**과
 *   CPU·메인 스레드를 나눠 쓰는 것을 줄인다. 운영 체감과 동일하게 두지 않는다(의도적).
 */

export function isNextJsDevelopmentBundle(): boolean {
  return process.env.NODE_ENV === "development";
}

/** dev 에서 `router.prefetch` 로 탭 전부를 미리 깔면 컴파일 큐가 쌓임 — 생략 */
export function shouldRunBottomNavProgrammaticPrefetch(): boolean {
  return !isNextJsDevelopmentBundle();
}

/** dev 에서 Philife 글로벌 피드 워밍은 네트워크·컴파일만 증가 — 생략 */
export function shouldRunPhilifeBackgroundFeedWarm(): boolean {
  return !isNextJsDevelopmentBundle();
}

/** dev 에서 홈 진입 후 셸 예열(여러 API)은 이동 체감과 겹침 — 생략 */
export function shouldRunHomeMainShellWarm(): boolean {
  return !isNextJsDevelopmentBundle();
}

/** dev 에서 Next `Link` 기본 prefetch 가 뷰포트에서 컴파일을 자주 당김 — 탭 링크만 끔 */
export function shouldEnableNextLinkPrefetchOnMainNav(): boolean {
  return !isNextJsDevelopmentBundle();
}

/** 방 화면 마운트 시 목록 URL `router.prefetch` — dev 에서는 생략 */
export function shouldRunMessengerListRoutePrefetch(): boolean {
  return !isNextJsDevelopmentBundle();
}
