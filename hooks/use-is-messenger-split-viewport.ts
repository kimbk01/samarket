"use client";

import { useSyncExternalStore } from "react";
import { APP_MESSENGER_SPLIT_MIN_PX } from "@/lib/ui/app-viewport-layout-breakpoints";

const QUERY = `(min-width: ${APP_MESSENGER_SPLIT_MIN_PX}px)`;

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

/** 768px+ — 메신저 Kakao/Telegram형 master-detail (모바일 full-page와 분리) */
export function useIsMessengerSplitViewport() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
