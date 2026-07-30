"use client";

import { useSyncExternalStore } from "react";
import { APP_MESSENGER_SPLIT_MEDIA_QUERY } from "@/lib/ui/app-viewport-layout-breakpoints";

function subscribe(onChange: () => void) {
  const m = window.matchMedia(APP_MESSENGER_SPLIT_MEDIA_QUERY);
  m.addEventListener("change", onChange);
  return () => m.removeEventListener("change", onChange);
}

function getSnapshot() {
  return window.matchMedia(APP_MESSENGER_SPLIT_MEDIA_QUERY).matches;
}

function getServerSnapshot() {
  return false;
}

/**
 * 768px+ **AND** landscape — 메신저 Kakao/Telegram형 master-detail.
 * 세로(폰·태블릿 portrait)는 항상 false → full hub.
 */
export function useIsMessengerSplitViewport() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
