"use client";

/**
 * 채팅 P0-3 (Owner 「채팅 P0 승인」 2026-11-11): 메신저 홈 탭·기본 탭 주소는 **제자리 교체**로만 바꾼다.
 *
 * 예전 `router.replace(?section=…)` 는 탭 상태를 바꾼 뒤 Next 서버 요청(RSC 160~300ms)과 페이지 다시 렌더를 한 번 더 만들어
 * 탭 전환마다 2번 끊겼다(실측). Next App Router 는 `window.history.replaceState` 를 감싸
 * `usePathname`·`useSearchParams` 를 같은 값으로 맞추고(ACTION_RESTORE — 서버 요청 없음) 내부 기록 상태를 보존한다
 * (`next/dist/client/components/app-router.js` replaceState 패치).
 *
 * 앱이 history.state 에 둔 다른 값은 유지한다. Next 내부 표식(`__NA`·트리)은 넘기지 않는다 — 넘기면 Next 가
 * 「자기 호출」로 보고 주소 동기화를 건너뛴다(패치가 현재 값으로 다시 채운다).
 */
export function replaceMessengerUrlInPlace(href: string): void {
  if (typeof window === "undefined") return;
  const cur = `${window.location.pathname}${window.location.search}`;
  if (cur === href) return;
  const prev = window.history.state;
  const data: Record<string, unknown> = {};
  if (prev && typeof prev === "object") {
    for (const [k, v] of Object.entries(prev as Record<string, unknown>)) {
      if (k === "__NA" || k === "__PRIVATE_NEXTJS_INTERNALS_TREE" || k === "_N") continue;
      data[k] = v;
    }
  }
  window.history.replaceState(data, "", href);
}

/** `guardedRouterReplace` 에 넘기는 제자리 교체 라우터 */
export const messengerInPlaceUrlRouter = {
  replace: (href: string) => replaceMessengerUrlInPlace(href),
};
