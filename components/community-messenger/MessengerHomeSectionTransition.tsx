"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  MESSENGER_MAIN_SECTION_TAB_ORDER,
  type MessengerMainSection,
} from "@/lib/community-messenger/messenger-ia";
import { MESSENGER_HOME_SECTION_ENTER_MS } from "@/lib/community-messenger/messenger-home-section-slide";

const SECTION_TAB_ENTER_SET = new Set<MessengerMainSection>(MESSENGER_MAIN_SECTION_TAB_ORDER);

type AnimPhase = "enter" | "enter-active" | "idle";

type Props = {
  section: MessengerMainSection;
  children: ReactNode;
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
 * 2단 탭 본문 — 우→좌 370ms.
 * 채팅방(`MessengerRoomSwipeBackShell`)과 동일하게 enter → rAF → enter-active transition 으로
 * keyframe 재시작·첫 프레임 플래시를 피한다.
 */
export function MessengerHomeSectionTransition({ section, children }: Props) {
  const reducedMotion = usePrefersReducedMotion();
  const skipEnterRef = useRef(true);
  const [phase, setPhase] = useState<AnimPhase>("idle");

  useEffect(() => {
    if (!SECTION_TAB_ENTER_SET.has(section)) {
      setPhase("idle");
      return;
    }
    if (skipEnterRef.current) {
      skipEnterRef.current = false;
      setPhase("idle");
      return;
    }
    if (reducedMotion) {
      setPhase("idle");
      return;
    }

    setPhase("enter");
    let raf2 = 0;
    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        setPhase((current) => (current === "enter" ? "enter-active" : current));
      });
    });
    const timer = window.setTimeout(() => {
      setPhase((current) => (current === "enter-active" ? "idle" : current));
    }, MESSENGER_HOME_SECTION_ENTER_MS + 48);

    return () => {
      window.cancelAnimationFrame(raf1);
      if (raf2) window.cancelAnimationFrame(raf2);
      window.clearTimeout(timer);
    };
  }, [reducedMotion, section]);

  const motionEnabled = SECTION_TAB_ENTER_SET.has(section) && !reducedMotion && phase !== "idle";
  const surfaceClassName = [
    "min-w-0 overflow-x-hidden",
    phase === "enter" ? "messenger-section-enter" : "",
    phase === "enter-active" ? "messenger-section-enter-active" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={surfaceClassName}
      data-messenger-section-animation-phase={motionEnabled ? phase : "idle"}
    >
      {children}
    </div>
  );
}
