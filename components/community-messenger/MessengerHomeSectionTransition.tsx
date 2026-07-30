"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  MESSENGER_MAIN_SECTION_TAB_ORDER,
  type MessengerMainSection,
} from "@/lib/community-messenger/messenger-ia";
import {
  planMessengerHomeSectionTransition,
  type MessengerHomeSectionSlideDirection,
} from "@/lib/community-messenger/messenger-home-section-slide";

const SECTION_TAB_ENTER_SET = new Set<MessengerMainSection>(MESSENGER_MAIN_SECTION_TAB_ORDER);

type Props = {
  section: MessengerMainSection;
  children: ReactNode;
};

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useLayoutEffect(() => {
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
 * 2단 탭 본문 — 탭 인덱스 차로 forward/backward 1회 animation.
 *
 * CONTRACT:
 * - section 1회 변경 → transition generation ≤ 1
 * - wrapper 에만 anim class — children remount 금지 (hydrate/목록 재조회 유발 금지)
 * - URL sync 는 이 컴포넌트 밖에서 pending no-op 로 generation 을 올리지 않아야 함
 * - MessengerRoomSwipeBackShell 과 경로 분리 (방 진입 슬라이드 수정 금지)
 */
export function MessengerHomeSectionTransition({ section, children }: Props) {
  const reducedMotion = usePrefersReducedMotion();
  const prevSectionRef = useRef<MessengerMainSection | null>(null);
  const skipInitialRef = useRef(true);
  const [direction, setDirection] = useState<MessengerHomeSectionSlideDirection | null>(null);
  const [generation, setGeneration] = useState(0);

  useLayoutEffect(() => {
    if (!SECTION_TAB_ENTER_SET.has(section)) {
      prevSectionRef.current = section;
      setDirection(null);
      return;
    }

    if (skipInitialRef.current) {
      skipInitialRef.current = false;
      prevSectionRef.current = section;
      return;
    }

    const previous = prevSectionRef.current;
    if (previous === section) {
      if (reducedMotion) setDirection(null);
      return;
    }

    const plan = planMessengerHomeSectionTransition({
      previous,
      next: section,
      reducedMotion,
      isInitialMount: false,
    });
    prevSectionRef.current = section;

    if (!plan.bumpGeneration || !plan.direction) {
      setDirection(null);
      return;
    }

    setGeneration((current) => current + 1);
    setDirection(plan.direction);
  }, [reducedMotion, section]);

  const animClass =
    direction === "forward"
      ? "messenger-section-anim-forward"
      : direction === "backward"
        ? "messenger-section-anim-backward"
        : "";

  return (
    <div
      className={["min-h-0 min-w-0 overflow-x-hidden", animClass].filter(Boolean).join(" ")}
      data-messenger-section-animation-phase={direction ? "enter-active" : "idle"}
      data-messenger-section-slide-direction={direction ?? "none"}
      data-messenger-section-transition-generation={String(generation)}
      onAnimationEnd={(event) => {
        if (event.target !== event.currentTarget) return;
        setDirection(null);
      }}
    >
      {children}
    </div>
  );
}
