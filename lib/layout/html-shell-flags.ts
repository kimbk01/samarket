/**
 * D1 F1 (Owner 승인 2026-11-11 · `docs/audit/d1-remaining-root-cause-design-2026-11-11.md` §1-2·§1-5)
 * `html:has(…)`·`body:has(…)` CSS 규칙 대체 — `<html>` 속성.
 *
 * 원인(운영 실측): `html`/`body` 를 주어로 한 `:has()` 가 있으면, 화면에 요소가 들어갈 때마다 브라우저가 문서 전체 스타일을
 * 다시 계산했다(탭 재진입 1회에 598개·986개 요소 재계산 2번). 규칙을 뺀 실험에서 12개·53개로 줄었다.
 * `html:not([속성]):has(…)` 처럼 꺼 두는 방식도 실험상 효과 없음 → `:has` 를 CSS 에서 완전히 없애고 이 속성으로 대신한다.
 *
 * 판정은 예전 `:has` 와 같은 DOM 조건을 그대로 읽는다(동작 동일). 갱신 시점:
 * - 첫 그림: 셸 서버 HTML 의 인라인 스크립트(`HTML_SHELL_FLAGS_INLINE_SCRIPT`)가 하단 탭 바로 뒤에서 1회 — 그리기 전.
 * - 이후: 해당 요소를 그리는 컴포넌트가 마운트·해제·모양 변경 때 `useHtmlShellFlagsSync` 로 요청(그리기 전 마이크로태스크).
 * 순수 모듈 — 서버에서 import 해도 안전(문서 접근은 함수 안에서만).
 */

export const HTML_SHELL_FLAG_ATTRS = {
  /** `html:has(.app-bottom-nav-shell)` */
  bottomNav: "data-shell-bottom-nav",
  /** `html:has(.app-bottom-nav-shell--side-rail)` */
  bottomNavSideRail: "data-shell-bottom-nav-side-rail",
  /** `html:has(.app-bottom-nav-shell--delivery)` */
  bottomNavDelivery: "data-shell-bottom-nav-delivery",
  /** `html:has(.app-bottom-nav-shell--scroll-hidden)` */
  bottomNavScrollHidden: "data-shell-bottom-nav-scroll-hidden",
  /** `html:has(.app-bottom-nav-shell :is(.app-bottom-nav-item--domain-hub, .app-bottom-nav-item--messenger-hub) .app-bottom-nav-icon-slot--domain-hub-orbit)` */
  bottomNavOrbit: "data-shell-bottom-nav-orbit",
  /** `html:has(.app-shell[data-dibay-nav-presentation="DESKTOP_SIDE_RAIL"])` */
  desktopSideRailShell: "data-shell-desktop-side-rail",
  /** `html:has(.stores-home-hub)` */
  storesHomeHub: "data-shell-stores-home-hub",
  /** `html:has([data-stores-browse-ptr-hint])` */
  storesBrowsePtrHint: "data-shell-stores-browse-ptr-hint",
  /** `body:has(.dibay-overlay-root)` */
  overlayOpen: "data-shell-overlay-open",
  /** `body:has([data-admin-console="v2"])` */
  adminConsoleV2: "data-shell-admin-console-v2",
} as const;

/**
 * DOM 조건 → 속성. 인라인 스크립트로도 그대로 쓰이므로 이 함수 본문은 **외부 참조 없이** 자체로 완결돼야 한다
 * (`Function.prototype.toString` 으로 직렬화).
 */
export function syncHtmlShellFlagsFromDom(doc: Document): void {
  const root = doc.documentElement;
  const set = (name: string, on: boolean) => {
    if (on) {
      if (root.getAttribute(name) !== "1") root.setAttribute(name, "1");
    } else if (root.hasAttribute(name)) {
      root.removeAttribute(name);
    }
  };
  /** 예전 `html:has(.app-bottom-nav-shell--x)` 와 같게 — 하단 탭이 여러 개면 그중 하나라도 해당하면 참 (D1 R4) */
  const navs = Array.from(doc.querySelectorAll(".app-bottom-nav-shell"));
  const nav = navs.length > 0 ? navs[0] : null;
  const navHas = (cls: string) => navs.some((n) => n.classList.contains(cls));
  set("data-shell-bottom-nav", !!nav);
  set("data-shell-bottom-nav-side-rail", navHas("app-bottom-nav-shell--side-rail"));
  set("data-shell-bottom-nav-delivery", navHas("app-bottom-nav-shell--delivery"));
  set("data-shell-bottom-nav-scroll-hidden", navHas("app-bottom-nav-shell--scroll-hidden"));
  set(
    "data-shell-bottom-nav-orbit",
    navs.some(
      (n) =>
        !!n.querySelector(
          ".app-bottom-nav-item--domain-hub .app-bottom-nav-icon-slot--domain-hub-orbit, .app-bottom-nav-item--messenger-hub .app-bottom-nav-icon-slot--domain-hub-orbit"
        )
    )
  );
  set(
    "data-shell-desktop-side-rail",
    !!doc.querySelector('.app-shell[data-dibay-nav-presentation="DESKTOP_SIDE_RAIL"]')
  );
  set("data-shell-stores-home-hub", !!doc.querySelector(".stores-home-hub"));
  set("data-shell-stores-browse-ptr-hint", !!doc.querySelector("[data-stores-browse-ptr-hint]"));
  set("data-shell-overlay-open", !!doc.querySelector(".dibay-overlay-root"));
  set("data-shell-admin-console-v2", !!doc.querySelector('[data-admin-console="v2"]'));
}

/** 셸 서버 HTML 에 넣는 인라인 스크립트 — 하단 탭 마크업 바로 뒤에서 실행(첫 그림 전). */
export const HTML_SHELL_FLAGS_INLINE_SCRIPT = `(function(){try{(${syncHtmlShellFlagsFromDom.toString()})(document)}catch(e){}})();`;

let scheduled = false;

/** 같은 작업 안의 여러 요청을 1번으로 — 마이크로태스크(그리기 전)에 DOM 을 읽어 속성 갱신 */
export function requestHtmlShellFlagsSync(): void {
  if (typeof document === "undefined" || scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    syncHtmlShellFlagsFromDom(document);
  });
}
