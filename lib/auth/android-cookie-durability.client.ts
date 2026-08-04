"use client";

/**
 * Android WebView CookieManager durability — flush memory cookies to disk.
 * iOS / Windows / plain web → no-op (not_android).
 *
 * CONTRACT:
 * - no cookie/token reads
 * - no SharedPreferences / localStorage Authority
 * - no OEM / model branches
 * - no sleep / polling
 */

import { resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";

export type AndroidCookieFlushResult =
  | "flushed"
  | "not_android"
  | "bridge_unavailable"
  | "flush_failed";

export type AndroidCookieFlushPhase = "login_completion" | "logout_wipe";

type DibayBootBridgeFlush = {
  flushAuthCookies?: () => boolean;
};

function readBridge(): DibayBootBridgeFlush | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { DibayBootBridge?: DibayBootBridgeFlush }).DibayBootBridge;
}

function emitFlushTelemetry(input: {
  platform: string;
  phase: AndroidCookieFlushPhase;
  result: AndroidCookieFlushResult;
  durationMs: number;
}): void {
  try {
    if (typeof console !== "undefined" && typeof console.info === "function") {
      console.info("[auth.cookie_flush]", {
        platform: input.platform,
        phase: input.phase,
        result: input.result,
        durationMs: Math.round(input.durationMs),
      });
    }
  } catch {
    /* ignore */
  }
}

/**
 * Flush Android CookieManager after auth cookie write/clear.
 * Old APK without bridge → bridge_unavailable (caller may continue login).
 * Bridge present but flush false/throw → flush_failed.
 */
export async function flushAndroidAuthCookies(
  phase: AndroidCookieFlushPhase,
): Promise<AndroidCookieFlushResult> {
  const started =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();

  const shell = resolveCapacitorShellPlatform();
  const platform = shell ?? "web";

  if (shell !== "android") {
    const result: AndroidCookieFlushResult = "not_android";
    emitFlushTelemetry({
      platform,
      phase,
      result,
      durationMs: (typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now()) - started,
    });
    return result;
  }

  const bridge = readBridge();
  if (typeof bridge?.flushAuthCookies !== "function") {
    const result: AndroidCookieFlushResult = "bridge_unavailable";
    emitFlushTelemetry({
      platform,
      phase,
      result,
      durationMs: (typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now()) - started,
    });
    return result;
  }

  try {
    const ok = bridge.flushAuthCookies();
    const result: AndroidCookieFlushResult = ok === true ? "flushed" : "flush_failed";
    emitFlushTelemetry({
      platform,
      phase,
      result,
      durationMs: (typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now()) - started,
    });
    return result;
  } catch {
    const result: AndroidCookieFlushResult = "flush_failed";
    emitFlushTelemetry({
      platform,
      phase,
      result,
      durationMs: (typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now()) - started,
    });
    return result;
  }
}
