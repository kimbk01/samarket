"use client";

import { useSyncExternalStore } from "react";
import { OWNER_DESKTOP_SHELL_MIN_PX } from "@/lib/business/owner-compact-shell-viewport";

const QUERY = `(min-width: ${OWNER_DESKTOP_SHELL_MIN_PX}px)`;

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

/** 1025px+ — 데스크탑 셸(좌측 메인 탭 레일) */
export function useIsDesktopShellViewport() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
