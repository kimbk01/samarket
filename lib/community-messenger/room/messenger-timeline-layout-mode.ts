import type { MutableRefObject, RefObject } from "react";

/** 타임라인 말풍선 행 — 진입 스크롤·페인트 대기 단일 셀렉터 */
export const CM_TIMELINE_MESSAGE_ROW_SELECTOR = "[data-cm-timeline-message-row]";

export function messengerTimelineViewportHasMessageRows(
  viewport: HTMLDivElement | null | undefined
): boolean {
  return Boolean(viewport?.querySelector(CM_TIMELINE_MESSAGE_ROW_SELECTOR));
}

/**
 * DO NOT: `cappedVirtualRows.length === 0` 만으로 direct 판정 — fallback 가상행이 absolute 로 그려져
 * 진입 시 빈 화면·전송 후에만 보이는 회귀(2026-05-24 배달 주문).
 */
export function resolveUseDirectMessengerTimelineLayout(opts: {
  hydrationPass: number;
  displayMessageCount: number;
  hasStoreOrderDock: boolean;
  /** 요약·store_order system 이 있으면 도크 없어도 direct(가상 겹침 방지) */
  hasStoreOrderTimeline?: boolean;
  virtualizerHasMeasuredRange: boolean;
}): boolean {
  const storeOrderTimeline = Boolean(opts.hasStoreOrderDock || opts.hasStoreOrderTimeline);
  const minHydrationPass = storeOrderTimeline ? 1 : 2;
  return (
    opts.hydrationPass >= minHydrationPass &&
    opts.displayMessageCount > 0 &&
    (storeOrderTimeline || !opts.virtualizerHasMeasuredRange)
  );
}

type ScheduleScrollAfterRowsOpts = {
  roomId: string;
  messagesViewportRef: RefObject<HTMLDivElement | null>;
  scroll: (opts?: { reason?: string }) => void;
  reason: string;
  stickToBottomRef?: MutableRefObject<boolean>;
  maxAttempts?: number;
};

const scrollAfterRowsRafByRoom = new Map<string, number>();

/**
 * viewport·첫 말풍선 DOM 이후 1회 스크롤. 동일 roomId 재호출 시 이전 rAF 체인 취소(중복 scrollTop 방지).
 */
export function scheduleMessengerScrollToBottomAfterRowsPainted(
  opts: ScheduleScrollAfterRowsOpts
): () => void {
  const rid = opts.roomId.trim();
  if (!rid || typeof requestAnimationFrame !== "function") return () => {};

  const cancelPending = () => {
    const id = scrollAfterRowsRafByRoom.get(rid);
    if (id != null) cancelAnimationFrame(id);
    scrollAfterRowsRafByRoom.delete(rid);
  };
  cancelPending();

  let cancelled = false;
  let attempts = 0;
  const maxAttempts = opts.maxAttempts ?? 24;

  const tick = () => {
    if (cancelled) return;
    attempts += 1;
    if (opts.stickToBottomRef && !opts.stickToBottomRef.current) {
      cancelPending();
      return;
    }
    const vp = opts.messagesViewportRef.current;
    if (vp && messengerTimelineViewportHasMessageRows(vp)) {
      cancelPending();
      opts.scroll({ reason: opts.reason });
      return;
    }
    if (attempts < maxAttempts) {
      const id = requestAnimationFrame(tick);
      scrollAfterRowsRafByRoom.set(rid, id);
    } else {
      cancelPending();
    }
  };

  const outer = requestAnimationFrame(() => {
    if (cancelled) return;
    const inner = requestAnimationFrame(tick);
    scrollAfterRowsRafByRoom.set(rid, inner);
  });
  scrollAfterRowsRafByRoom.set(rid, outer);

  return () => {
    cancelled = true;
    cancelPending();
  };
}
