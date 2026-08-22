"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  getStoresHomeTier1HiddenServerSnapshot,
  getStoresHomeTier1HiddenSnapshot,
  subscribeStoresHomeTier1Hidden,
} from "@/lib/stores/stores-home-header-scroll-chrome";
import { noteStoresHomeTier1HiddenChanged } from "@/lib/stores/stores-home-header-runtime-instrumentation";

export function useStoresHomeTier1Hidden(): boolean {
  return useSyncExternalStore(
    subscribeStoresHomeTier1Hidden,
    getStoresHomeTier1HiddenSnapshot,
    getStoresHomeTier1HiddenServerSnapshot
  );
}

/** Wraps TIER1 chrome — grid collapse in sticky header (no scrollTop correction). */
export function StoresHomeTier1ScrollShell({ children }: { children: React.ReactNode }) {
  const hidden = useStoresHomeTier1Hidden();

  useEffect(() => {
    noteStoresHomeTier1HiddenChanged(hidden);
  }, [hidden]);

  return (
    <div
      data-stores-home-tier1-shell
      data-stores-home-tier="1"
      data-hidden={hidden ? "true" : "false"}
      className="w-full shrink-0"
    >
      <div data-stores-home-tier1-inner className="min-h-0 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
