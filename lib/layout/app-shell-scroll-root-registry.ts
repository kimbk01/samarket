/**
 * F 단계 (Owner 「정해진 설계안 순서대로」 2026-11-10, `docs/audit/app-tab-navigation-root-cause-design-2026-11-10.md` §1-F):
 * 앱 셸 스크롤 후보(허브 본문 `<main data-main-hub-scroll-body>`)가 생기거나·바뀌거나·사라질 때만 알린다.
 *
 * 원인(실측): `subscribeAppShellScroll` 구독 8곳이 각자 `document.body` 전체 하위 MutationObserver·ResizeObserver 를 걸고,
 * DOM 이 바뀔 때마다 스크롤 루트를 다시 판정(getComputedStyle·scrollHeight 강제 계산)했다 — 탭 이동당 0.2~0.3초.
 * 이제 후보 요소의 소유자(`MainHubScrollBody`)가 직접 알린다 — 전역 DOM 관찰 없음.
 */
type Listener = () => void;
const listeners = new Set<Listener>();

export function notifyAppShellScrollRootsChanged(): void {
  for (const l of [...listeners]) {
    try {
      l();
    } catch {
      /* ignore */
    }
  }
}

export function subscribeAppShellScrollRoots(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
