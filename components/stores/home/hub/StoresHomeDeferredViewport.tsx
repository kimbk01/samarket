"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const DEFAULT_ROOT_MARGIN = "120px 0px 0px";

/**
 * 첫 카드 레일 아래 섹션 — 뷰포트 진입 전 마운트·hydration 지연.
 * `renderContent` 는 visible 이후에만 호출 — children prop 평가 long task 방지.
 */
export function StoresHomeDeferredViewport({
  renderContent,
  onBecomeVisible,
  minHeightClass = "min-h-[8rem]",
  rootMargin = DEFAULT_ROOT_MARGIN,
}: {
  renderContent: () => ReactNode;
  onBecomeVisible?: () => void;
  minHeightClass?: string;
  rootMargin?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const becameVisibleRef = useRef(false);

  useEffect(() => {
    const node = hostRef.current;
    if (!node || visible) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { root: null, rootMargin, threshold: 0.01 }
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [rootMargin, visible]);

  useEffect(() => {
    if (!visible || becameVisibleRef.current) return;
    becameVisibleRef.current = true;
    onBecomeVisible?.();
  }, [onBecomeVisible, visible]);

  return (
    <div ref={hostRef} className={visible ? undefined : minHeightClass}>
      {visible ? renderContent() : null}
    </div>
  );
}
