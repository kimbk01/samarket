"use client";

import { useLayoutEffect, useRef } from "react";
import { registerBrowseSubtopicCollapseSentinel } from "@/lib/stores/browse-subtopic-collapse-chrome";
import { useDeliverySurfaceLifecycle } from "@/components/delivery/presentation/DeliverySurfaceLifecycle";

/**
 * browse 목록 스크롤 본문 최상단 sentinel — 4단 접힘 IO·scroll-root 좌표 루트.
 * `MainHubScrollColumn` `[data-main-hub-scroll-body]` 와 쌍.
 */
export function BrowseSubtopicCollapseSentinel({ routeKey }: { routeKey: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const lifecycle = useDeliverySurfaceLifecycle("browse");
  const active = lifecycle === "active";

  useLayoutEffect(() => {
    if (!active) {
      registerBrowseSubtopicCollapseSentinel(null);
      return;
    }
    registerBrowseSubtopicCollapseSentinel(ref.current);
    return () => registerBrowseSubtopicCollapseSentinel(null);
  }, [active, routeKey]);

  return (
    <div
      ref={ref}
      data-browse-subtopic-collapse-sentinel
      className="pointer-events-none h-px w-full shrink-0"
      aria-hidden
    />
  );
}
