"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useStoresBrowseHeaderScrollHide } from "@/lib/stores/use-stores-browse-header-scroll-hide";

/** browse 4단(2차 업종 칩) — 스크롤 다운 시만 접음. 1·2·3·5단은 유지 */
export function StoresBrowseHeaderScrollCollapse({ children }: { children: ReactNode }) {
  const collapsed = useStoresBrowseHeaderScrollHide();
  const innerRef = useRef<HTMLDivElement>(null);
  const [measuredHeight, setMeasuredHeight] = useState(0);

  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const measure = () => setMeasuredHeight(el.scrollHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      data-stores-browse-subtopic-collapse
      data-collapsed={collapsed ? "true" : "false"}
      className="overflow-hidden transition-[max-height] duration-300 ease-out motion-reduce:transition-none"
      style={{ maxHeight: collapsed ? 0 : measuredHeight > 0 ? measuredHeight : undefined }}
      aria-hidden={collapsed || undefined}
    >
      <div ref={innerRef} className={collapsed ? "pointer-events-none" : undefined}>
        {children}
      </div>
    </div>
  );
}
