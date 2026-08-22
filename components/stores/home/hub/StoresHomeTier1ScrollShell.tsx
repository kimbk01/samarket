"use client";

import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";
import {
  getStoresHomeTier1HiddenServerSnapshot,
  getStoresHomeTier1HiddenSnapshot,
  subscribeStoresHomeTier1Hidden,
} from "@/lib/stores/stores-home-header-scroll-chrome";

export function useStoresHomeTier1Hidden(): boolean {
  return useSyncExternalStore(
    subscribeStoresHomeTier1Hidden,
    getStoresHomeTier1HiddenSnapshot,
    getStoresHomeTier1HiddenServerSnapshot
  );
}

/** Wraps TIER1 chrome — transform/max-height collapse without duplicate instances. */
export function StoresHomeTier1ScrollShell({ children }: { children: React.ReactNode }) {
  const hidden = useStoresHomeTier1Hidden();

  return (
    <div
      data-stores-home-tier1-shell
      data-stores-home-tier="1"
      data-hidden={hidden ? "true" : "false"}
      className="w-full shrink-0 overflow-hidden"
    >
      {children}
    </div>
  );
}
