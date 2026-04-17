/**
 * Next.js **개발 서버** 전용 판별 (`npm run dev` 등으로 번들이 `development` 일 때).
 *
 * - `next build` + `next start`(로컬 포함) 는 `production` 번들 → 여기서는 false.
 */

export function isNextJsDevelopmentBundle(): boolean {
  return process.env.NODE_ENV === "development";
}

/**
 * 메인 하단 탭 `router.prefetch` 배치 — 기본 **허용**(탭 이동 콜드 스타트 완화).
 * 배치만 과하면 `NEXT_PUBLIC_DISABLE_MAIN_NAV_PROGRAMMATIC_PREFETCH=1`.
 */
export function shouldRunBottomNavProgrammaticPrefetch(): boolean {
  return process.env.NEXT_PUBLIC_DISABLE_MAIN_NAV_PROGRAMMATIC_PREFETCH !== "1";
}

/** dev 에서 Philife 글로벌 피드 워밍은 네트워크·컴파일만 증가 — 생략 */
export function shouldRunPhilifeBackgroundFeedWarm(): boolean {
  return !isNextJsDevelopmentBundle();
}

/** dev 에서 홈 진입 후 셸 예열(여러 API)은 이동 체감과 겹침 — 생략 */
export function shouldRunHomeMainShellWarm(): boolean {
  return !isNextJsDevelopmentBundle();
}

/**
 * 메인 탭 `Link prefetch` — 기본 **허용**. 뷰포트 탭만 Next 가 선로딩(운영·개발 동일 체감 목표).
 * `NEXT_PUBLIC_DISABLE_MAIN_NAV_LINK_PREFETCH=1` 로만 끈다.
 */
export function shouldEnableNextLinkPrefetchOnMainNav(): boolean {
  return process.env.NEXT_PUBLIC_DISABLE_MAIN_NAV_LINK_PREFETCH !== "1";
}

/**
 * 방 화면 마운트 시 목록 URL `router.prefetch` — 기본 허용.
 * `NEXT_PUBLIC_DISABLE_MESSENGER_LIST_ROUTE_PREFETCH=1` 로 끔.
 */
export function shouldRunMessengerListRoutePrefetch(): boolean {
  return process.env.NEXT_PUBLIC_DISABLE_MESSENGER_LIST_ROUTE_PREFETCH !== "1";
}
