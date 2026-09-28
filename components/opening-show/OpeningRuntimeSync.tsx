"use client";

import { useEffect } from "react";
import { prepareOpeningRuntimePack } from "@/lib/opening-show/opening-runtime-native";
import type { OpeningRuntimeManifest } from "@/lib/opening-show/runtime-contract";
import { resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";

/**
 * Runtime pack sync while the app is already running.
 * Cold start never waits on this fetch.
 */
export function OpeningRuntimeSync() {
  useEffect(() => {
    const shell = resolveCapacitorShellPlatform();
    if (shell !== "android" && shell !== "ios") return;
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/app/opening-runtime", { cache: "no-store", credentials: "same-origin" });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        live?: boolean;
        revisionId?: string;
        revisionNumber?: number;
        documentVersion?: number;
        sceneDurationMs?: number;
        checksum?: string;
        scenes?: OpeningRuntimeManifest["scenes"];
        assets?: OpeningRuntimeManifest["assets"];
      };
      if (cancelled || !res.ok || json.ok !== true || json.live !== true) return;
      if (!json.revisionId || !json.checksum || !json.scenes || !json.assets) return;
      await prepareOpeningRuntimePack({
        revisionId: json.revisionId,
        revisionNumber: json.revisionNumber ?? 0,
        documentVersion: json.documentVersion ?? 1,
        sceneDurationMs: json.sceneDurationMs ?? 2400,
        checksum: json.checksum,
        scenes: json.scenes,
        assets: json.assets,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
