"use client";

import { useSupportFabRegistry } from "@/lib/support/support-fab-registry";
import { isSupportContextEnabled } from "@/lib/support/support-context";

export function useSupportContext() {
  return useSupportFabRegistry().context;
}

export function useSupportFabVisible(): boolean {
  const ctx = useSupportContext();
  return isSupportContextEnabled(ctx);
}
