"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type TransitionEvent as ReactTransitionEvent,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { markCommunityMessengerHomeReturn } from "@/lib/community-messenger/home-return-timing";
import { buildMessengerRoomListBackHref } from "@/lib/community-messenger/messenger-entry-origin";
import { runHistoryBackWithFallback } from "@/lib/navigation/history-back-fallback";
import { SAMARKET_ROUTES } from "@/lib/app/samarket-route-map";
import {
  MESSENGER_LIST_ROOM_SLIDE_MS,
  MESSENGER_LIST_ROOM_SLIDE_EASING,
} from "@/lib/community-messenger/messenger-list-room-slide";

const EDGE_HIT_PX = 18;
const HORIZONTAL_LOCK_PX = 10;
const THRESHOLD_RATIO = 0.22;
const MIN_COMMIT_PX = 56;

type AnimPhase = "idle" | "dragging" | "snap-back" | "snap-away";

type Props = {
  children: ReactNode;
  /** 스냅샷 전에는 비활성 */
  roomType: string | null | undefined;
};

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return reduced;
}

/**
 * 채팅방: 화면 **왼쪽 가장자리**에서 오른쪽으로 드래그하면 목록으로 돌아가는 방향과 동일하게 화면이 손가락을 따라 이동.
 * 임계값 이상이면 복귀, 미만이면 스냅백. 헤더 뒤로와 동일한 복귀 규칙(`runHistoryBackWithFallback`).
 */
export function MessengerRoomSwipeBackShell({ children, roomType }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reducedMotion = usePrefersReducedMotion();
  const fallbackHref = useMemo(() => buildMessengerRoomListBackHref(searchParams), [searchParams]);

  const [phase, setPhase] = useState<AnimPhase>("idle");
  const [dragPx, setDragPx] = useState(0);
  const dragPxRef = useRef(0);
  useEffect(() => {
    dragPxRef.current = dragPx;
  }, [dragPx]);

  const gestureRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    armed: boolean;
    horizontal: boolean;
  } | null>(null);
  const edgeRef = useRef<HTMLDivElement | null>(null);
  const pendingNavRef = useRef(false);
  const committedNavRef = useRef(false);

  const widthRef = useRef(
    typeof window !== "undefined" ? window.innerWidth : 400
  );
  useEffect(() => {
    const onResize = () => {
      widthRef.current = window.innerWidth;
    };
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const commitNavigation = useCallback(() => {
    if (committedNavRef.current) return;
    committedNavRef.current = true;
    markCommunityMessengerHomeReturn();
    if (roomType === "open_group") {
      router.replace(SAMARKET_ROUTES.chat.messengerMeetingsHub, { scroll: false });
      return;
    }
    runHistoryBackWithFallback(router, fallbackHref);
  }, [router, fallbackHref, roomType]);

  const onEdgePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (reducedMotion || roomType == null) return;
      if (e.button !== 0) return;
      if (typeof window === "undefined") return;
      if (e.clientX > EDGE_HIT_PX) return;
      gestureRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        armed: true,
        horizontal: false,
      };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
    },
    [reducedMotion, roomType]
  );

  const onEdgePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const g = gestureRef.current;
      if (!g || g.pointerId !== e.pointerId || !g.armed) return;
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      if (!g.horizontal) {
        if (Math.abs(dx) < HORIZONTAL_LOCK_PX && Math.abs(dy) < HORIZONTAL_LOCK_PX) return;
        if (Math.abs(dy) >= Math.abs(dx)) {
          g.armed = false;
          gestureRef.current = null;
          setPhase("idle");
          setDragPx(0);
          try {
            e.currentTarget.releasePointerCapture(e.pointerId);
          } catch {
            /* noop */
          }
          return;
        }
        g.horizontal = true;
        setPhase("dragging");
      }
      if (!g.horizontal) return;
      const w = widthRef.current || window.innerWidth;
      const next = Math.max(0, Math.min(dx, w));
      setDragPx(next);
    },
    []
  );

  const finishGesture = useCallback(() => {
    const g = gestureRef.current;
    gestureRef.current = null;
    if (!g) return;
    if (!g.horizontal) {
      setPhase("idle");
      setDragPx(0);
      return;
    }
    const w = widthRef.current || (typeof window !== "undefined" ? window.innerWidth : 400);
    const x = dragPxRef.current;
    const threshold = Math.max(MIN_COMMIT_PX, w * THRESHOLD_RATIO);
    if (x >= threshold) {
      pendingNavRef.current = true;
      setPhase("snap-away");
      setDragPx(w);
    } else {
      setPhase("snap-back");
      setDragPx(0);
    }
  }, []);

  const onEdgePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const g = gestureRef.current;
      if (!g || g.pointerId !== e.pointerId) return;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
      finishGesture();
    },
    [finishGesture]
  );

  const onEdgePointerCancel = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const g = gestureRef.current;
      if (!g || g.pointerId !== e.pointerId) return;
      gestureRef.current = null;
      setPhase("snap-back");
      setDragPx(0);
    },
    []
  );

  const onSurfaceTransitionEnd = useCallback(
    (e: ReactTransitionEvent<HTMLDivElement>) => {
      if (e.propertyName !== "transform") return;
      if (phase === "snap-away" && pendingNavRef.current) {
        pendingNavRef.current = false;
        commitNavigation();
        setPhase("idle");
        setDragPx(0);
        return;
      }
      if (phase === "snap-back") {
        setPhase("idle");
      }
    },
    [phase, commitNavigation]
  );

  /** transitionend 누락(네비게이션 선행 등) 시에도 복귀 보장 */
  useEffect(() => {
    if (phase !== "snap-away" || !pendingNavRef.current) return;
    const t = window.setTimeout(() => {
      if (!pendingNavRef.current) return;
      pendingNavRef.current = false;
      commitNavigation();
      setPhase("idle");
      setDragPx(0);
    }, MESSENGER_LIST_ROOM_SLIDE_MS + 100);
    return () => window.clearTimeout(t);
  }, [phase, commitNavigation]);

  const surfaceStyle = useMemo(() => {
    const dragging = phase === "dragging";
    const animating = phase === "snap-back" || phase === "snap-away";
    const transition =
      dragging || phase === "idle"
        ? undefined
        : `transform ${MESSENGER_LIST_ROOM_SLIDE_MS}ms ${MESSENGER_LIST_ROOM_SLIDE_EASING}`;
    return {
      transform: `translate3d(${dragPx}px,0,0)`,
      transition: dragging ? "none" : animating ? transition : undefined,
      willChange: dragging ? ("transform" as const) : ("auto" as const),
    } as const;
  }, [dragPx, phase]);

  const disabled = reducedMotion || roomType == null;

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      {!disabled ? (
        <div
          ref={edgeRef}
          role="presentation"
          aria-hidden
          className="fixed top-0 bottom-0 left-0 z-[120] w-[18px] touch-none"
          style={{
            // 좁은 엣지 히트 — 헤더 뒤로 버튼(px-3 이후)과 겹침 최소화
            pointerEvents: "auto",
          }}
          onPointerDown={onEdgePointerDown}
          onPointerMove={onEdgePointerMove}
          onPointerUp={onEdgePointerUp}
          onPointerCancel={onEdgePointerCancel}
        />
      ) : null}
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col"
        style={surfaceStyle}
        onTransitionEnd={onSurfaceTransitionEnd}
      >
        {children}
      </div>
    </div>
  );
}
