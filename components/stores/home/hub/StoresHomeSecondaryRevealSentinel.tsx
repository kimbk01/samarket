"use client";

import { useLayoutEffect, useRef } from "react";
import { registerStoresHomeSecondaryRevealSentinel } from "@/lib/stores/stores-home-secondary-reveal-chrome";

/** Zero-height scroll boundary — TIER2 reveal authority (scroll-body, not IO ratio). */
export function StoresHomeSecondaryRevealSentinel() {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    registerStoresHomeSecondaryRevealSentinel(el);
    return () => registerStoresHomeSecondaryRevealSentinel(null);
  }, []);

  return (
    <div
      ref={ref}
      data-stores-home-secondary-reveal-sentinel
      data-stores-home-tier="2-boundary"
      className="pointer-events-none h-0 w-full shrink-0"
      aria-hidden
    />
  );
}
