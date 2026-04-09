"use client";

import { useSyncExternalStore } from "react";

/** Tailwind `md` 미만 — 내정보 콘솔 모바일 전용 분기 */
const QUERY = "(max-width: 767px)";

function subscribe(onChange: () => void) {
  const m = window.matchMedia(QUERY);
  m.addEventListener("change", onChange);
  return () => m.removeEventListener("change", onChange);
}

function getSnapshot() {
  return window.matchMedia(QUERY).matches;
}

function getServerSnapshot() {
  return false;
}

export function useIsMobileViewport() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
