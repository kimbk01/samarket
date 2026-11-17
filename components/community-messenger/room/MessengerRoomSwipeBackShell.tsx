"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type TransitionEvent as ReactTransitionEvent,
} from "react";
import { useRouter } from "next/navigation";
import { useIsMessengerSplitViewport } from "@/hooks/use-is-messenger-split-viewport";
import { useMessengerRoomUrlSearchParams } from "@/lib/community-messenger/room/use-messenger-room-url-search-params";
import { markCommunityMessengerHomeReturn } from "@/lib/community-messenger/home-return-timing";
import { noteRoomEntryArrived } from "@/lib/community-messenger/community-messenger-room-forward-navigation";
import {
  resolveMessengerRoomBackTargetNow,
  runMessengerRoomBackTarget,
  type MessengerRoomListKind,
} from "@/lib/community-messenger/room/messenger-room-back-target";
import { setPageBackOwner } from "@/lib/ui/overlay-back-stack";
import { useOwnerOrderChatSlideHost } from "@/components/business/owner/OwnerOrderChatSlideHostContext";
import { useBuyerOrderChatSlideHost } from "@/components/mypage/BuyerOrderChatSlideHostContext";
import {
  dismissMessengerRoomEntrySnapshot,
  hasMessengerRoomEntrySnapshot,
  revealMessengerRoomEntrySnapshot,
  runMessengerRoomExitWithSnapshot,
} from "@/lib/community-messenger/room/messenger-page-snapshot-transition";
import {
  MESSENGER_LIST_ROOM_ENTER_EASING,
  MESSENGER_LIST_ROOM_ENTER_MS,
  MESSENGER_LIST_ROOM_EXIT_EASING,
  MESSENGER_LIST_ROOM_EXIT_MS,
} from "@/lib/community-messenger/messenger-list-room-slide";
import { subscribePopstateBeforeRouter } from "@/lib/navigation/popstate-before-router";

const EDGE_HIT_PX = 18;
const HORIZONTAL_LOCK_PX = 10;
const THRESHOLD_RATIO = 0.3;
const MIN_COMMIT_PX = 56;
/** `.messenger-enter` 시작 위치(translate 90%) — 목록 복사본 잘라 내기 시작점과 일치해야 한다 */
const MESSENGER_ROOM_ENTER_START_OFFSET_RATIO = 0.9;

/**
 * PAGE_HIERARCHY: mount enter RIGHT→LEFT; swipe/UI back snap-away LEFT→RIGHT.
 * Split pane: no full-page enter/exit (pane-local BY_DESIGN).
 */
type AnimPhase =
  | "enter"
  | "enter-active"
  | "idle"
  | "dragging"
  | "snap-back"
  | "snap-away"
  | "exit-active";

type Props = {
  children: ReactNode;
  roomId: string | null | undefined;
  /** 스냅샷 전에는 비활성 */
  roomType: string | null | undefined;
  /** P5 — 방 종류 목록(`communityMessengerRoomInboxGroupKind`). 스냅샷 전 null */
  roomListKind?: MessengerRoomListKind | null;
  /** P5 — 주문 방을 사장님이 볼 때 사장님 주문 채팅 목록(`resolveOwnerOrderChatsBackHref`) */
  ownerOrderChatsHref?: string | null;
};

function usePrefersReducedMotion(): boolean {
  /** 첫 렌더부터 실제 값 — 진입 애니메이션 시작(layout effect) 판단이 늦게 바뀌지 않게. */
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
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

const MessengerRoomAnimatedBackContext = createContext<(() => void) | null>(null);

export function useMessengerRoomAnimatedBack(): (() => void) | null {
  return useContext(MessengerRoomAnimatedBackContext);
}

/**
 * 채팅방: 화면 **왼쪽 가장자리**에서 오른쪽으로 드래그하면 목록으로 돌아가는 방향과 동일하게 화면이 손가락을 따라 이동.
 * 임계값 이상이면 복귀, 미만이면 스냅백. 헤더 뒤로와 동일한 목적지(`messenger-room-back-target` — P5 단일 정의).
 */
export function MessengerRoomSwipeBackShell({
  children,
  roomId,
  roomType,
  roomListKind = null,
  ownerOrderChatsHref = null,
}: Props) {
  const router = useRouter();
  const searchParams = useMessengerRoomUrlSearchParams();
  const reducedMotion = usePrefersReducedMotion();
  const isMessengerSplit = useIsMessengerSplitViewport();
  const splitPaneMode = isMessengerSplit;
  /** 주문 채팅 슬라이드 안이면 ◁ 는 슬라이드 쪽 몫 — 페이지 뒤로 주인을 등록하지 않는다(P5 §B6). */
  const ownerSlideHost = useOwnerOrderChatSlideHost();
  const buyerSlideHost = useBuyerOrderChatSlideHost();
  const insideOrderChatSlide = ownerSlideHost != null || buyerSlideHost != null;
  /** P5 — 머리글 ‹·가장자리 스와이프·Android ◁ 공용 목적지. 누른 순간의 기록 항목으로 판정. */
  const resolveBackTarget = useCallback(
    () => resolveMessengerRoomBackTargetNow({ roomType, listKind: roomListKind, searchParams, ownerOrderChatsHref }),
    [roomType, roomListKind, searchParams, ownerOrderChatsHref]
  );

  const [phase, setPhase] = useState<AnimPhase>("idle");
  const [dragPx, setDragPx] = useState(0);
  const dragPxRef = useRef(0);
  const enterStartedRef = useRef(false);
  useEffect(() => {
    dragPxRef.current = dragPx;
  }, [dragPx]);

  /**
   * Mobile PAGE_HIERARCHY enter — RIGHT → LEFT (double rAF avoids first-frame flash).
   * roomType may be null on cold BootstrapGate shell — still enter so PAGE MOTION OWNER
   * owns first paint (EntryEmpty is content inside shell, not a pre-motion full-page flash).
   * Gestures / animated back remain disabled until roomType is known.
   *
   * useLayoutEffect: 첫 커밋(idle = 제자리)이 화면에 그려지기 전에 "enter"(화면 밖)로 바꾼다.
   * passive useEffect 였을 때는 방이 제자리에 한 프레임 보였다가 화면 밖으로 튄 뒤 들어오는 깜빡임이 있었다.
   */
  /** 진입 애니메이션 없이 열리는 경우(분할 화면·축소 모션) — 목록 복사본 즉시 제거 */
  useLayoutEffect(() => {
    if (splitPaneMode || reducedMotion) dismissMessengerRoomEntrySnapshot();
  }, [splitPaneMode, reducedMotion]);

  useLayoutEffect(() => {
    if (splitPaneMode || reducedMotion) return;
    if (enterStartedRef.current) return;
    enterStartedRef.current = true;
    setPhase("enter");
    let raf2 = 0;
    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        setPhase((p) => (p === "enter" ? "enter-active" : p));
      });
    });
    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
    };
  }, [splitPaneMode, reducedMotion]);


  /**
   * 방이 들어오기 시작하는 커밋(그리기 전)에 목록 복사본을 같은 시간·곡선으로 잘라 낸다 —
   * 방이 목록 위로 밀고 들어오는 모습(흰 화면 없음). 복사본이 없으면(알림 진입 등) 아무것도 안 함.
   */
  useLayoutEffect(() => {
    if (phase !== "enter-active") return;
    if (!hasMessengerRoomEntrySnapshot()) return;
    revealMessengerRoomEntrySnapshot({
      durationMs: MESSENGER_LIST_ROOM_ENTER_MS,
      easing: MESSENGER_LIST_ROOM_ENTER_EASING,
      startOffsetRatio: MESSENGER_ROOM_ENTER_START_OFFSET_RATIO,
    });
  }, [phase]);

  useEffect(() => {
    if (phase !== "enter-active") return;
    const t = window.setTimeout(() => {
      setPhase((p) => (p === "enter-active" ? "idle" : p));
      const rid = roomId?.trim();
      if (rid) noteRoomEntryArrived(rid);
    }, MESSENGER_LIST_ROOM_ENTER_MS + 80);
    return () => window.clearTimeout(t);
  }, [phase, roomId]);

  /**
   * 방 진입이 **끝났을 때만**(들어오는 움직임 완료 = 위 타이머, 또는 움직임 없이 여는 분할·축소 모션) 진입 중 뒤로 감시를 끈다.
   * 진입 중(목록 사진이 아직 남은 동안)의 뒤로는 탭 때 걸어 둔 감시(`armRoomEntryAbortOnBack`)가 진입 상태를 정리하고,
   * 그 뒤의 뒤로는 아래 방 퇴장 리스너가 처리한다(둘 다 Next 보다 먼저 — `lib/navigation/popstate-before-router.ts`).
   */
  useEffect(() => {
    const rid = roomId?.trim();
    if (rid && (splitPaneMode || reducedMotion)) noteRoomEntryArrived(rid);
  }, [roomId, splitPaneMode, reducedMotion]);

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
  /** P5 — 페이지 뒤로 주인이 부르는 최신 `requestAnimatedBack` */
  const requestAnimatedBackRef = useRef<() => void>(() => {});

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
    markCommunityMessengerHomeReturn({ roomId });
    /**
     * 헤더 ← 와 같은 목적지 (분할 포함) — Android 시스템 뒤로와 결과 일치 (BK-06).
     * 이동 1회: 앱 안 진입 = back, 알림·첫 기록 진입 = 방 종류 목록 replace (오픈 그룹 특례·280ms 폴백 없음).
     */
    runMessengerRoomBackTarget(router, resolveBackTarget());
  }, [router, resolveBackTarget, roomId]);

  /**
   * 방 화면 복사본을 고정한 채 즉시 목록으로 이동하고, 목록이 그려지면 복사본을 오른쪽으로 밀어낸다
   * (방이 빠지는 동안 뒤에 흰 화면 대신 목록). 복사본을 못 만들면 false → 기존 snap-away.
   */
  const exitWithSnapshot = useCallback((): boolean => {
    if (reducedMotion || splitPaneMode) return false;
    if (committedNavRef.current) return true;
    return runMessengerRoomExitWithSnapshot({
      navigate: commitNavigation,
      durationMs: MESSENGER_LIST_ROOM_EXIT_MS,
      easing: MESSENGER_LIST_ROOM_EXIT_EASING,
    });
  }, [commitNavigation, reducedMotion, splitPaneMode]);

  /**
   * 안드로이드 뒤로가기·history.back — popstate 시점에는 아직 방 화면이 그려져 있으므로 복사본을 고정하고
   * 목록이 그려지면 오른쪽으로 밀어낸다. 방 안 시트 닫기(같은 방 URL 유지)는 대상 아님.
   */
  useEffect(() => {
    if (reducedMotion || splitPaneMode) return;
    const rid = roomId?.trim();
    if (!rid) return;
    const onPopState = () => {
      if (committedNavRef.current || pendingNavRef.current) return;
      const path = window.location.pathname;
      if (path.includes(`/community-messenger/rooms/${encodeURIComponent(rid)}`) || path.includes(`/community-messenger/rooms/${rid}`)) {
        return;
      }
      committedNavRef.current = true;
      runMessengerRoomExitWithSnapshot({
        navigate: () => {},
        durationMs: MESSENGER_LIST_ROOM_EXIT_MS,
        easing: MESSENGER_LIST_ROOM_EXIT_EASING,
      });
    };
    const offPopBefore = subscribePopstateBeforeRouter(onPopState);
    return () => offPopBefore();
  }, [reducedMotion, roomId, splitPaneMode]);

  const requestAnimatedBack = useCallback(() => {
    if (committedNavRef.current || pendingNavRef.current) return;
    if (reducedMotion || splitPaneMode) {
      commitNavigation();
      return;
    }
    if (exitWithSnapshot()) return;
    markCommunityMessengerHomeReturn({ roomId });
    /** Same LEFT→RIGHT path as edge swipe — ONE return presentation owner. */
    pendingNavRef.current = true;
    const w = widthRef.current || (typeof window !== "undefined" ? window.innerWidth : 400);
    setPhase("snap-away");
    setDragPx(w);
  }, [commitNavigation, exitWithSnapshot, roomId, reducedMotion, splitPaneMode]);
  useEffect(() => {
    requestAnimatedBackRef.current = requestAnimatedBack;
  }, [requestAnimatedBack]);

  /**
   * P5 Android ◁ — 목적지가 「방 종류 목록 replace」(알림·첫 기록 진입)일 때만 페이지 뒤로 주인으로 등록한다.
   * 앱 안 진입(history back)이면 등록하지 않아 ◁ 는 지금처럼 네이티브 WebView 뒤로 → 위 popstate 퇴장 그림(S1 유지).
   * 스냅샷 전(roomType 없음)·주문 채팅 슬라이드 안은 등록하지 않는다. 처리 순서: 오버레이(시트) → 이 주인 → 결함 E.
   */
  useEffect(() => {
    if (roomType == null || insideOrderChatSlide) return;
    const target = resolveBackTarget();
    if (target.kind !== "replace") return;
    console.info("[cm-room-back] page_back_owner", { roomId: roomId?.trim() ?? "", href: target.href });
    return setPageBackOwner(() => requestAnimatedBackRef.current());
  }, [insideOrderChatSlide, resolveBackTarget, roomId, roomType]);

  const onEdgePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (reducedMotion || splitPaneMode || roomType == null) return;
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
    [reducedMotion, splitPaneMode, roomType]
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
      if (exitWithSnapshot()) return;
      pendingNavRef.current = true;
      setPhase("snap-away");
      setDragPx(w);
    } else {
      setPhase("snap-back");
      setDragPx(0);
    }
  }, [exitWithSnapshot]);

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
      if (phase === "enter-active") {
        setPhase("idle");
        return;
      }
      if (phase === "snap-away" && pendingNavRef.current) {
        pendingNavRef.current = false;
        commitNavigation();
        setPhase("idle");
        setDragPx(0);
        return;
      }
      if (phase === "exit-active" && pendingNavRef.current) {
        pendingNavRef.current = false;
        commitNavigation();
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
    if ((phase !== "snap-away" && phase !== "exit-active") || !pendingNavRef.current) return;
    const t = window.setTimeout(() => {
      if (!pendingNavRef.current) return;
      pendingNavRef.current = false;
      commitNavigation();
      setPhase("idle");
      setDragPx(0);
    }, MESSENGER_LIST_ROOM_EXIT_MS + 100);
    return () => window.clearTimeout(t);
  }, [phase, commitNavigation]);

  const surfaceStyle = useMemo(() => {
    const dragging = phase === "dragging";
    const animating = phase === "snap-back" || phase === "snap-away";
    const enterTransition =
      phase === "enter-active"
        ? `transform ${MESSENGER_LIST_ROOM_ENTER_MS}ms ${MESSENGER_LIST_ROOM_ENTER_EASING}`
        : undefined;
    const exitTransition =
      dragging || phase === "idle" || phase === "enter" || phase === "enter-active"
        ? undefined
        : `transform ${MESSENGER_LIST_ROOM_EXIT_MS}ms ${MESSENGER_LIST_ROOM_EXIT_EASING}`;
    const transition = enterTransition ?? exitTransition;
    const transform =
      dragging || animating ? `translate3d(${dragPx}px,0,0)` : undefined;
    return {
      transform,
      transition: dragging
        ? "none"
        : animating || phase === "exit-active" || phase === "enter-active"
          ? transition
          : undefined,
      willChange:
        dragging ||
        animating ||
        phase === "exit-active" ||
        phase === "enter" ||
        phase === "enter-active"
          ? ("transform" as const)
          : ("auto" as const),
    } as const;
  }, [dragPx, phase]);

  const disabled = reducedMotion || roomType == null || splitPaneMode;
  const surfaceClassName = [
    "messenger-page",
    "messenger-room-page",
    "flex min-h-0 min-w-0 flex-1 flex-col",
    phase === "enter" ? "messenger-enter" : "",
    phase === "enter-active" ? "messenger-enter messenger-enter-active" : "",
    phase === "idle" || phase === "dragging" || phase === "snap-back" || phase === "snap-away"
      ? "messenger-exit"
      : "",
    phase === "exit-active" ? "messenger-exit-active" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <MessengerRoomAnimatedBackContext.Provider value={requestAnimatedBack}>
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
        className={surfaceClassName}
        data-messenger-room-animation-phase={phase}
        style={surfaceStyle}
        onTransitionEnd={onSurfaceTransitionEnd}
      >
        {children}
      </div>
    </div>
    </MessengerRoomAnimatedBackContext.Provider>
  );
}
