"use client";

import { useEffect, useLayoutEffect } from "react";
import {
  acquireStoresHomeTier1ScrollChrome,
  releaseStoresHomeTier1ScrollChrome,
} from "@/lib/stores/stores-home-header-scroll-chrome";
import { useMainHubPtrDomain } from "@/lib/layout/use-main-hub-ptr-domain";

/** `/stores` — TIER1 scroll hide authority lifecycle (single subscriber). */
export function StoresHomeHeaderScrollChromeHost() {
  const ptrDomain = useMainHubPtrDomain();
  const enabled = ptrDomain === "stores";

  useLayoutEffect(() => {
    if (!enabled) return;
    acquireStoresHomeTier1ScrollChrome();
    return () => releaseStoresHomeTier1ScrollChrome();
  }, [enabled]);

  return null;
}
