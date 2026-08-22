"use client";

import { useLayoutEffect, useRef } from "react";
import { registerStoresHomeScrollContentStart } from "@/lib/stores/stores-home-secondary-reveal-chrome";

/** Scroll-body content origin — canonical geometry partner for TIER3 bottom boundary (not hero proxy). */
export function StoresHomeScrollContentStart() {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    registerStoresHomeScrollContentStart(ref.current);
    return () => registerStoresHomeScrollContentStart(null);
  }, []);

  return (
    <div
      ref={ref}
      data-stores-home-scroll-content-start
      className="pointer-events-none h-0 w-full shrink-0"
      aria-hidden
    />
  );
}
