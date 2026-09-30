"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { OsEntryScreen } from "@/components/os-entry/OsEntryScreen";
import { resolveOsEntryColdConfig } from "@/lib/os-entry/local-cache";
import { shouldRunOsEntryRuntime } from "@/lib/os-entry/runtime-platform";
import {
  getAppReadySnapshot,
  subscribeAppReady,
} from "@/lib/startup/startup-metrics";
import type { OsEntryConfig } from "@/lib/os-entry/types";

/**
 * Lightweight Product OS Start owner.
 * 1) local config  2) render  3) timer after visible commit AND native splash dismissed
 * 4) release existing app
 * Never navigates; never cold-fetches config.
 */
export function OsEntryOwner() {
  const [surface, setSurface] = useState<{
    config: OsEntryConfig;
    imageSrc: string | null;
  } | null>(null);
  const releasedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerArmedRef = useRef(false);
  const visibleCommittedRef = useRef(false);
  const minMsRef = useRef(0);
  const visibleAtRef = useRef<number | null>(null);

  const release = useCallback(() => {
    if (releasedRef.current) return;
    releasedRef.current = true;
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setSurface(null);
  }, []);

  const armReleaseTimer = useCallback(() => {
    if (releasedRef.current || timerArmedRef.current) return;
    if (!visibleCommittedRef.current) return;
    // Native OS/Cap splash must be gone — otherwise timer elapses under splash (no user pixels).
    if (!getAppReadySnapshot()) return;
    timerArmedRef.current = true;
    if (visibleAtRef.current == null) {
      visibleAtRef.current = Date.now();
    }
    const ms = Math.max(0, minMsRef.current);
    timerRef.current = setTimeout(() => {
      release();
    }, ms);
  }, [release]);

  useEffect(() => {
    if (!shouldRunOsEntryRuntime()) return;
    const cold = resolveOsEntryColdConfig();
    minMsRef.current = cold.config.minimumVisibleMs;
    setSurface({ config: cold.config, imageSrc: cold.imageSrc });
    if (typeof window !== "undefined") {
      (
        window as Window & {
          __dibayOsEntryProbe?: () => {
            active: boolean;
            revision: number;
            source: string;
            visibleAt: number | null;
            appReady: boolean;
          };
        }
      ).__dibayOsEntryProbe = () => ({
        active: !releasedRef.current && surface != null,
        revision: cold.config.revision,
        source: cold.source,
        visibleAt: visibleAtRef.current,
        appReady: getAppReadySnapshot(),
      });
    }
  }, []);

  useEffect(() => {
    if (!shouldRunOsEntryRuntime()) return;
    if (getAppReadySnapshot()) {
      armReleaseTimer();
    }
    return subscribeAppReady(() => {
      armReleaseTimer();
    });
  }, [armReleaseTimer]);

  const onVisibleCommit = useCallback(() => {
    if (releasedRef.current || visibleCommittedRef.current) return;
    visibleCommittedRef.current = true;
    armReleaseTimer();
  }, [armReleaseTimer]);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) clearTimeout(timerRef.current);
    };
  }, []);

  if (!surface) return null;

  return (
    <OsEntryScreen
      config={surface.config}
      imageSrc={surface.imageSrc}
      onVisibleCommit={onVisibleCommit}
    />
  );
}
