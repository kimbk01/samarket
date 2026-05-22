"use client";

import { useSyncExternalStore } from "react";
import { OWNER_COMPACT_SHELL_MEDIA_QUERY } from "@/lib/business/owner-compact-shell-viewport";

function subscribe(onChange: () => void) {
  const m = window.matchMedia(OWNER_COMPACT_SHELL_MEDIA_QUERY);
  m.addEventListener("change", onChange);
  return () => m.removeEventListener("change", onChange);
}

function getSnapshot() {
  return window.matchMedia(OWNER_COMPACT_SHELL_MEDIA_QUERY).matches;
}

function getServerSnapshot() {
  return false;
}

/** `BusinessAdminShell` — 하단 탭·모바일 헤더·드로어·햄버거 (≤1024px, design-tokens `--sam-bp-lg-min`) */
export function useOwnerCompactShellViewport() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
