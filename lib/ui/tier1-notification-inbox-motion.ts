/** 1단 헤더 종 알림 팝업 — 열림·닫힘 공통 (240ms) */
export const TIER1_NOTIFICATION_INBOX_MOTION_MS = 240;

/** 모바일 뷰포트 가로 80% (좌·우 각 10% 여백) */
export const TIER1_NOTIFICATION_INBOX_POPUP_WIDTH_RATIO = 0.8;

/** 팝업 높이 — 벨 아래 가용 세로 (읽기 편한 높이) */
export const TIER1_NOTIFICATION_INBOX_POPUP_HEIGHT_RATIO = 0.78;

/** 태블릿·데스크톱 상한 — `MyHeaderNotificationInbox` · `min(92vw,24rem)` 과 동일 계열 */
export const TIER1_NOTIFICATION_INBOX_POPUP_MAX_WIDTH_PX = 400;

/** 세로 상한 — 탭+목록이 한 화면에 들어오도록 */
export const TIER1_NOTIFICATION_INBOX_POPUP_MAX_HEIGHT_PX = 560;

export type Tier1NotificationInboxPopupLayout = {
  top: number;
  left: number;
  width: number;
  height: number;
};

function readMobileViewportWidth(): { width: number; offsetLeft: number } {
  if (typeof window === "undefined") {
    return { width: 360, offsetLeft: 0 };
  }
  const vv = window.visualViewport;
  if (vv && vv.width > 0) {
    return { width: vv.width, offsetLeft: vv.offsetLeft };
  }
  return { width: window.innerWidth, offsetLeft: 0 };
}

/** 종(벨) 기준 top · 가로 min(뷰포트 80%, 24rem) 중앙 · 세로 min(가용 2/3, 32rem) */
export function computeTier1NotificationInboxPopupLayout(anchorRect: DOMRect): Tier1NotificationInboxPopupLayout {
  const { width: viewportWidth, offsetLeft } = readMobileViewportWidth();
  const top = Math.max(anchorRect.top, 0);
  const bottomReserve = 56;
  const availableHeight = Math.max(280, window.innerHeight - top - bottomReserve);
  const width = Math.round(
    Math.min(
      viewportWidth * TIER1_NOTIFICATION_INBOX_POPUP_WIDTH_RATIO,
      TIER1_NOTIFICATION_INBOX_POPUP_MAX_WIDTH_PX
    )
  );
  const left = Math.round(offsetLeft + (viewportWidth - width) / 2);
  const height = Math.round(
    Math.min(
      availableHeight * TIER1_NOTIFICATION_INBOX_POPUP_HEIGHT_RATIO,
      TIER1_NOTIFICATION_INBOX_POPUP_MAX_HEIGHT_PX
    )
  );
  return { top, left, width, height };
}
