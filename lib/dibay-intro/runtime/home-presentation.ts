"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";

type DibayIntroHostPlugin = {
  notifyHomePresentationReady(options: { surface: string }): Promise<void>;
};

const DibayIntroHost = registerPlugin<DibayIntroHostPlugin>("DibayIntroHost");

declare global {
  interface Window {
    __dibayHomePresentationReady?: boolean;
    __dibayHomePresentationSurface?: string;
  }
}

/**
 * Application-owned HOME first meaningful surface.
 * Not WebView created, DOMContentLoaded, React mounted, route mounted, or ConditionalAppShell.
 */
export function markHomePresentationReady(surface: string): void {
  if (typeof window === "undefined") return;
  if (window.__dibayHomePresentationReady) return;
  window.__dibayHomePresentationReady = true;
  window.__dibayHomePresentationSurface = surface;
  window.dispatchEvent(new CustomEvent("dibay-home-presentation-ready", { detail: { surface } }));
  if (!Capacitor.isNativePlatform()) return;
  void DibayIntroHost.notifyHomePresentationReady({ surface }).catch(() => undefined);
}

export function isHomePresentationReady(): boolean {
  return typeof window !== "undefined" && window.__dibayHomePresentationReady === true;
}
