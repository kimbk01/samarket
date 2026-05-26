"use client";

import { useLayoutEffect } from "react";
import { installStoresHomePerfObservers } from "@/lib/stores/stores-home-perf-marks";

/** `/stores` 홈 — LCP·longtask 관측 1회 설치 */
export function StoresHomePerfBoot() {
  useLayoutEffect(() => {
    installStoresHomePerfObservers();
  }, []);
  return null;
}
