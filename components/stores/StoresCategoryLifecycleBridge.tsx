"use client";

import { useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { applyStoresCategorySurfaceTransition } from "@/lib/stores/stores-category-surface-lifecycle";

/**
 * App-wide stores category lifecycle — `/stores` layout 밖 NON-STORES 전환까지 본다.
 * DeliveryPresentationShell 의 in-tree 호출과 동일 authority (`applyStoresCategorySurfaceTransition`).
 */
export function StoresCategoryLifecycleBridge() {
  const pathname = usePathname() ?? "";
  const prevPathRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const pathKey = pathname.split("?")[0] ?? "";
    const prev = prevPathRef.current;
    if (prev === null) {
      prevPathRef.current = pathKey;
      return;
    }
    if (prev === pathKey) return;
    applyStoresCategorySurfaceTransition(prev, pathKey);
    prevPathRef.current = pathKey;
  }, [pathname]);

  return null;
}
