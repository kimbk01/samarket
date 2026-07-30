"use client";

import { useSyncExternalStore } from "react";
import {
  messengerHubSurfaceDataAttrs,
  readMessengerHubSurfaceNow,
  type MessengerHubSurface,
} from "@/lib/ui/messenger-hub-surface";
import { APP_MESSENGER_SPLIT_MEDIA_QUERY } from "@/lib/ui/app-viewport-layout-breakpoints";

const SSR_SURFACE: MessengerHubSurface = {
  platform: "window",
  form: "phone",
  orientation: "portrait",
  layout: "hub",
};

let cached: MessengerHubSurface = SSR_SURFACE;

function surfacesEqual(a: MessengerHubSurface, b: MessengerHubSurface): boolean {
  return (
    a.platform === b.platform &&
    a.form === b.form &&
    a.orientation === b.orientation &&
    a.layout === b.layout
  );
}

function readCachedSurface(): MessengerHubSurface {
  const next = readMessengerHubSurfaceNow();
  if (surfacesEqual(cached, next)) return cached;
  cached = next;
  return cached;
}

function subscribe(onChange: () => void) {
  const m = window.matchMedia(APP_MESSENGER_SPLIT_MEDIA_QUERY);
  const onOrient = () => onChange();
  m.addEventListener("change", onChange);
  window.addEventListener("resize", onOrient);
  window.addEventListener("orientationchange", onOrient);
  return () => {
    m.removeEventListener("change", onChange);
    window.removeEventListener("resize", onOrient);
    window.removeEventListener("orientationchange", onOrient);
  };
}

/** iOS / Android / window · form · portrait|landscape · hub|split — ResponsiveShell DOM 스탬프용 */
export function useMessengerHubSurface(): MessengerHubSurface {
  return useSyncExternalStore(subscribe, readCachedSurface, () => SSR_SURFACE);
}

export function useMessengerHubSurfaceDataAttrs(): Record<string, string> {
  return messengerHubSurfaceDataAttrs(useMessengerHubSurface());
}
