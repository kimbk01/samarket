"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef } from "react";
import { armMessengerRoomRoutePrefetch } from "@/lib/community-messenger/room/arm-messenger-room-route-prefetch";
import {
  isTradeVisibleRoomRealtimeReportingEnabled,
  reportTradeRoomListIntersection,
} from "@/lib/trade/trade-visible-room-realtime-registry";

/**
 * 목록 행이 뷰포트에 대략 30~50% 이상 들어올 때만 `enqueueRoomPrefetch` — TTL·큐 중복은 큐 내부에서 처리.
 * 스크롤 리스너 없이 IntersectionObserver 만 사용.
 */
export const MESSENGER_ROOM_LIST_PREFETCH_IO_THRESHOLD = 0.4;
/** 뷰포트 아래 여유 ~3행 분량 — 스크롤 직전에 다음 방들을 미리 큐에 올린다 */
export const MESSENGER_ROOM_LIST_PREFETCH_ROOT_MARGIN_PX = 240;

export function useMessengerRoomListPrefetchRefCallback(
  roomId: string,
  enabled: boolean,
  priorityScore = 0,
  href?: string | null
) {
  const router = useRouter();
  const roomIdRef = useRef(roomId);
  const priorityRef = useRef(priorityScore);
  const hrefRef = useRef(href ?? "");
  roomIdRef.current = roomId;
  priorityRef.current = priorityScore;
  hrefRef.current = href ?? `/community-messenger/rooms/${encodeURIComponent(roomId)}`;
  const ioCleanupRef = useRef<(() => void) | null>(null);

  return useCallback(
    (node: HTMLElement | null) => {
      ioCleanupRef.current?.();
      ioCleanupRef.current = null;
      if (!enabled) return;
      if (!node || typeof IntersectionObserver === "undefined") return;

      const io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            const intersecting = e.isIntersecting;
            if (isTradeVisibleRoomRealtimeReportingEnabled()) {
              reportTradeRoomListIntersection(roomIdRef.current, intersecting);
            }
            if (!intersecting) continue;
            if (typeof document !== "undefined" && document.visibilityState !== "visible") continue;
            const rid = roomIdRef.current;
            const h = hrefRef.current || `/community-messenger/rooms/${encodeURIComponent(rid)}`;
            armMessengerRoomRoutePrefetch({
              roomId: rid,
              href: h,
              router,
              source: "intersection",
              priorityScore: priorityRef.current,
            });
          }
        },
        {
          root: null,
          rootMargin: `0px 0px ${MESSENGER_ROOM_LIST_PREFETCH_ROOT_MARGIN_PX}px 0px`,
          threshold: MESSENGER_ROOM_LIST_PREFETCH_IO_THRESHOLD,
        }
      );
      io.observe(node);
      ioCleanupRef.current = () => {
        io.disconnect();
      };
    },
    [enabled, href, roomId, priorityScore, router]
  );
}
