"use client";

import { useEffect } from "react";
import { ensureStoresHomeLcpObserver } from "@/lib/stores/use-stores-home-first-lcp";

if (typeof window !== "undefined") {
  ensureStoresHomeLcpObserver();
}

/** `/stores` — React root 전 LCP observer 선기동 */
export function StoresHomeLcpObserver() {
  useEffect(() => {
    ensureStoresHomeLcpObserver();
  }, []);
  return null;
}
