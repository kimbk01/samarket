"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type TransitionEvent as ReactTransitionEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  MESSENGER_CALL_SLIDE_ENTER_MS,
} from "@/lib/community-messenger/messenger-call-slide";
import { navigateBackFromCommunityMessengerCall } from "@/lib/community-messenger/call-session-navigation-seed";
import { getCommunityMessengerCallRuntimeSurface } from "@/lib/community-messenger/call-runtime-registry";

type AnimPhase = "enter" | "enter-active" | "idle" | "exit" | "exit-active";

type Props = {
  children: ReactNode;
  /** tmp 발신 dial — 440ms 슬라이드 생략 (수신·active·일반 진입에는 미적용) */
  instantOutgoingDialEnter?: boolean;
  /** 수신 accept route (`action=accept` / `nativeAccept=1`) — 440ms 슬라이드 생략 (P1-1b) */
  instantIncomingAcceptEnter?: boolean;
};

const CommunityMessengerCallAnimatedBackContext = createContext<(() => void) | null>(null);

export function useCommunityMessengerCallAnimatedBack(): (() => void) | null {
  return useContext(CommunityMessengerCallAnimatedBackContext);
}

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

/** 통화 라우트 진입·복귀 — 440ms 우→좌 슬라이드 (tmp 발신·수신 accept 는 instant*Enter 로 생략) */
export function CommunityMessengerCallEnterShell({
  children,
  instantOutgoingDialEnter = false,
  instantIncomingAcceptEnter = false,
}: Props) {
  const router = useRouter();
  const reducedMotion = usePrefersReducedMotion();
  const skipEnterSlide = reducedMotion || instantOutgoingDialEnter || instantIncomingAcceptEnter;
  const [phase, setPhase] = useState<AnimPhase>(skipEnterSlide ? "idle" : "enter");
  const exitingRef = useRef(false);

  useEffect(() => {
    if (skipEnterSlide) {
      setPhase("idle");
      return;
    }
    const raf = window.requestAnimationFrame(() => {
      setPhase((current) => (current === "enter" ? "enter-active" : current));
    });
    return () => window.cancelAnimationFrame(raf);
  }, [skipEnterSlide]);

  useEffect(() => {
    if (phase !== "enter-active" || skipEnterSlide) return;
    const t = window.setTimeout(() => {
      setPhase((current) => (current === "enter-active" ? "idle" : current));
    }, MESSENGER_CALL_SLIDE_ENTER_MS + 80);
    return () => window.clearTimeout(t);
  }, [phase, skipEnterSlide]);

  const leaveCallRoute = useCallback(() => {
    const minimize = getCommunityMessengerCallRuntimeSurface().minimizeToPip;
    if (minimize) {
      minimize();
      return;
    }
    navigateBackFromCommunityMessengerCall({ replace: (href) => router.replace(href) }, null);
  }, [router]);

  const requestAnimatedBack = useCallback(() => {
    if (exitingRef.current) return;
    exitingRef.current = true;
    if (reducedMotion) {
      leaveCallRoute();
      return;
    }
    setPhase("exit-active");
  }, [leaveCallRoute, reducedMotion]);

  const onTransitionEnd = useCallback(
    (e: ReactTransitionEvent<HTMLDivElement>) => {
      if (e.propertyName !== "transform") return;
      if (phase !== "exit-active") return;
      leaveCallRoute();
    },
    [leaveCallRoute, phase]
  );

  const surfaceClassName = [
    "messenger-page messenger-room-page flex min-h-0 min-w-0 flex-1 flex-col",
    phase === "enter" ? "messenger-call-enter" : "",
    phase === "enter-active" ? "messenger-call-enter-active" : "",
    phase === "idle" ? "messenger-call-exit" : "",
    phase === "exit-active" ? "messenger-call-exit-active" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <CommunityMessengerCallAnimatedBackContext.Provider value={requestAnimatedBack}>
      <div className={surfaceClassName} onTransitionEnd={onTransitionEnd}>
        {children}
      </div>
    </CommunityMessengerCallAnimatedBackContext.Provider>
  );
}
