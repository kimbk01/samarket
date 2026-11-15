/**
 * 뒤로·앞으로(popstate)를 **Next 라우터보다 먼저** 받는 앱 전체 단일 리스너.
 *
 * 왜: Next(`app-router.js`)는 window popstate 리스너 안에서 이동을 처리하고 React 19 는 그 이동을 같은 이벤트 안에서
 * 바로 화면에 반영한다. window 리스너는 **등록 순서대로** 불린다(캡처 여부 무관 — Chrome 156 WebView 실측 2026-11-15,
 * #323 정정). 그래서 Next 보다 늦게 등록된 화면 리스너는
 *  - 이동으로 사라지는 화면(채팅방)이면 이벤트 도중 제거되어 **불리지 않고**(방 퇴장 그림 미실행),
 *  - 남는 화면(슬라이드 셸)이면 이미 바뀐 화면을 본 뒤에 불려 「뒤로」 판정이 늦다.
 *
 * 해결: `<head>` 인라인 스크립트(`POPSTATE_BEFORE_ROUTER_BOOT_SCRIPT`)가 앱 번들보다 먼저 window 에 리스너 1개를 걸고,
 * 화면은 `subscribePopstateBeforeRouter` 로 그 목록에 들어간다 → 언제 마운트됐든 Next 보다 먼저, 이동 전 화면에서 실행된다.
 */

type PopstateHandler = (ev: PopStateEvent) => void;
type HubWindow = Window & { __dibayPopBefore?: PopstateHandler[] };

/** `app/layout.tsx` `<head>` — 번들보다 먼저 실행. 구독자 오류는 서로 막지 않는다. */
export const POPSTATE_BEFORE_ROUTER_BOOT_SCRIPT =
  "(function(){if(window.__dibayPopBefore)return;var s=window.__dibayPopBefore=[];" +
  "window.addEventListener('popstate',function(e){var l=s.slice();for(var i=0;i<l.length;i++){try{l[i](e)}catch(_){}}});})();";

function hub(): PopstateHandler[] | null {
  if (typeof window === "undefined") return null;
  const w = window as HubWindow;
  if (!w.__dibayPopBefore) {
    /** 부트 스크립트가 없는 환경(시험 등) — 같은 모양으로 지금 설치(이 경우만 Next 이후일 수 있음) */
    const list: PopstateHandler[] = [];
    w.__dibayPopBefore = list;
    window.addEventListener("popstate", (e) => {
      for (const fn of list.slice()) {
        try {
          fn(e);
        } catch {
          /* 다른 구독자 계속 */
        }
      }
    });
  }
  return w.__dibayPopBefore;
}

/** Next 라우터보다 먼저 popstate 를 받는다. 반환값으로 해제. */
export function subscribePopstateBeforeRouter(fn: PopstateHandler): () => void {
  const list = hub();
  if (!list) return () => {};
  list.push(fn);
  return () => {
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  };
}
