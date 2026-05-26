"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const DEFAULT_ROOT_MARGIN = "120px 0px 0px";

/**
 * 첫 카드 레일 아래 섹션 — 뷰포트 진입 전 마운트·hydration 지연.
 * UI 구조 동일, placeholder 높이만 최소 유지.
 */
export function StoresHomeDeferredViewport({
  children,
  minHeightClass = "min-h-[8rem]",
  rootMargin = DEFAULT_ROOT_MARGIN,
}: {
  children: ReactNode;
  minHeightClass?: string;
  rootMargin?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

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

  return (
    <div ref={hostRef} className={visible ? undefined : minHeightClass}>
      {visible ? children : null}
    </div>
  );
}
