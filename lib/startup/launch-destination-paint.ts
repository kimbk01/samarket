/**
 * 알림 목적지 시작 — 목적지 「그림」 판정 (설계 23-9 · docs/audit/app-entry-device-fail-root-cause-design-2026-11-17.md).
 *
 * 실측(11-18 Xiaomi · 실제 채팅 알림 탭): 경로가 채팅방으로 바뀐 첫 커밋에서 시작 화면 덮개가 걷혔는데,
 * 그 순간 화면은 로그인 확인 중 자리 표시(`AuthSessionBoundary` 「불러오는 중…」) → 채팅방 입장 대기(「채팅방 입장 중…」)였다.
 * 경로 일치만으로는 목적지가 그려졌다고 볼 수 없다 — 이 모듈은 「지금 보이는 화면이 목적지 자리 표시인가」만 동기로 판단한다.
 *
 * - 로그인 확인 막음(`data-auth-session-boundary="blocked"`)이 보이면 대기.
 * - 채팅방 입장 대기(`data-cm-room-entry-buffering`)가 보이면 대기.
 * - 채팅방 경로인데 채팅방 화면(`data-cm-room`, 입장 대기 아님)이 아직 없으면 대기 (휴대폰 `loading.tsx` 는 아무것도 그리지 않는다).
 * - 숨긴 보관 화면(`display:none` 조상)은 세지 않는다.
 * 타이머 없음. 다시 판정은 화면 변경 관찰(MutationObserver)로만 한다.
 */
import { isCommunityMessengerRoomRoutePathname } from "@/lib/community-messenger/messenger-room-pathname";

export const AUTH_SESSION_BLOCKED_SELECTOR = '[data-auth-session-boundary="blocked"]';
export const CM_ROOM_ENTRY_BUFFERING_SELECTOR = "[data-cm-room-entry-buffering]";
export const CM_ROOM_SHELL_SELECTOR = "[data-cm-room]";

function isShown(el: Element): boolean {
  // 설계 §24 D7: 브라우저의 한 번 판정(`checkVisibility` — Chrome 105+/WebView) 우선. 없을 때만 조상 순회.
  const check = (el as Element & { checkVisibility?: () => boolean }).checkVisibility;
  if (typeof check === "function") return check.call(el);
  for (let node: Element | null = el; node; node = node.parentElement) {
    if (typeof getComputedStyle === "function" && getComputedStyle(node).display === "none") return false;
  }
  return true;
}

function anyShown(root: ParentNode, selector: string): boolean {
  for (const el of root.querySelectorAll(selector)) {
    if (isShown(el)) return true;
  }
  return false;
}

/** 지금 보이는 화면이 알림 목적지의 자리 표시인가(아직 목적지 그림이 아님). */
export function isLaunchDestinationPaintPending(pathname: string, root: ParentNode = document): boolean {
  if (anyShown(root, AUTH_SESSION_BLOCKED_SELECTOR)) return true;
  if (anyShown(root, CM_ROOM_ENTRY_BUFFERING_SELECTOR)) return true;
  if (isCommunityMessengerRoomRoutePathname(pathname)) {
    for (const el of root.querySelectorAll(CM_ROOM_SHELL_SELECTOR)) {
      if (!el.hasAttribute("data-cm-room-entry-buffering") && isShown(el)) return false;
    }
    return true;
  }
  return false;
}

let observer: MutationObserver | null = null;

/** 화면이 바뀔 때마다 `run` — 한 번만 건다. 해제되면 `stopWatchingLaunchDestinationPaint`. */
export function watchLaunchDestinationPaint(run: () => void): void {
  if (observer || typeof MutationObserver === "undefined" || typeof document === "undefined") return;
  observer = new MutationObserver(() => run());
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["data-auth-session-boundary", "data-cm-room-entry-buffering", "data-cm-room", "style"],
  });
}

export function stopWatchingLaunchDestinationPaint(): void {
  observer?.disconnect();
  observer = null;
}

/** Tests only. */
export function __resetLaunchDestinationPaintForTests(): void {
  stopWatchingLaunchDestinationPaint();
}
