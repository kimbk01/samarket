"use client";

/**
 * DIBAY INTRO — V2 foreground sync host.
 * Triggers only on native app foreground / resume.
 * Does NOT run on cold Intro startup path. Does NOT touch Call/Popup.
 */

import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { runNativeIntroForegroundSync } from "@/lib/intro/device/sync-host.client";

export function IntroForegroundSyncHost() {
  const started = useRef(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let remove: (() => void) | undefined;
    let cancelled = false;

    const kick = () => {
      void runNativeIntroForegroundSync().catch((err) => {
        console.warn("[DibayIntroSync] failed", err);
      });
    };

    // First kick after shell is already running (not cold Intro).
    if (!started.current) {
      started.current = true;
      const t = window.setTimeout(kick, 2500);
      remove = () => window.clearTimeout(t);
    }

    void import("@capacitor/app").then(({ App }) => {
      if (cancelled) return;
      const sub = App.addListener("appStateChange", ({ isActive }) => {
        if (isActive) kick();
      });
      const prev = remove;
      remove = () => {
        prev?.();
        void sub.then((h) => h.remove());
      };
    });

    return () => {
      cancelled = true;
      remove?.();
    };
  }, []);

  return null;
}
