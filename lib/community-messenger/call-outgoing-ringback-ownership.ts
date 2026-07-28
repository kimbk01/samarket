/**
 * Web outgoing ringback ownership — skip Web tone when Native Runtime owns establishment.
 *
 * CONTRACT
 * - Android: Sync shell check only (no iOS bridge Async).
 * - iOS: must await shouldSkipWebOutgoingRingbackAsync before any Web start.
 * - Never start Web then stop after Async (no dual flash).
 * - Exception during ownership → Web fallback if still valid (call itself must not fail).
 */
import {
  isAndroidNativeOutgoingShell,
  isIOSNativeOutgoingShell,
  isIOSNativeVideoOutgoingShell,
} from "@/lib/call/native/native-outgoing-bridge";
import { isCapacitorNativePlatform, resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";

/** callId → latest ownership-attempt generation (stale Async cancel). */
const ownershipAttemptByCallId = new Map<string, number>();
let ownershipAttemptSeq = 0;

function normalizeCallId(callId: string): string {
  return callId.trim();
}

function beginOwnershipAttempt(callId: string): number {
  const sid = normalizeCallId(callId);
  const token = ++ownershipAttemptSeq;
  if (sid) ownershipAttemptByCallId.set(sid, token);
  return token;
}

function isOwnershipAttemptCurrent(callId: string, token: number): boolean {
  const sid = normalizeCallId(callId);
  if (!sid) return false;
  return ownershipAttemptByCallId.get(sid) === token;
}

/**
 * Invalidate pending iOS Async Web-start attempts for a call (or all).
 * Call on stop / sid replace / unmount before or with stopOutgoingRingback.
 */
export function invalidateWebOutgoingRingbackOwnership(callId?: string | null): void {
  const sid = callId?.trim() ?? "";
  if (!sid) {
    ownershipAttemptByCallId.clear();
    ownershipAttemptSeq += 1;
    return;
  }
  ownershipAttemptByCallId.delete(sid);
  ownershipAttemptSeq += 1;
}

/** @internal tests */
export function resetWebOutgoingRingbackOwnershipForTests(): void {
  ownershipAttemptByCallId.clear();
  ownershipAttemptSeq = 0;
}

/**
 * True when Web must not start outgoing ringback (native owner will).
 * Sync for Android; iOS always false here — use Async / startWebOutgoingRingbackIfAllowed.
 */
export function shouldSkipWebOutgoingRingbackSync(_kind: "voice" | "video"): boolean {
  if (!isCapacitorNativePlatform()) return false;
  if (resolveCapacitorShellPlatform() === "android") {
    return isAndroidNativeOutgoingShell();
  }
  return false;
}

/**
 * Full ownership: Android Sync shell + iOS native lane flags.
 * True ⇒ nativeOwnsOutgoingRingback (Web must skip).
 */
export async function shouldSkipWebOutgoingRingbackAsync(kind: "voice" | "video"): Promise<boolean> {
  if (!isCapacitorNativePlatform()) return false;
  if (resolveCapacitorShellPlatform() === "android") {
    return isAndroidNativeOutgoingShell();
  }
  if (resolveCapacitorShellPlatform() === "ios") {
    if (kind === "video") return await isIOSNativeVideoOutgoingShell();
    return await isIOSNativeOutgoingShell();
  }
  return false;
}

/** Alias — nativeOwnsOutgoingRingback === shouldSkipWebOutgoingRingbackAsync */
export async function resolveNativeOwnsOutgoingRingback(kind: "voice" | "video"): Promise<boolean> {
  return shouldSkipWebOutgoingRingbackAsync(kind);
}

export type StartWebOutgoingRingbackIfAllowedArgs = {
  kind: "voice" | "video";
  callId: string;
  /** Return false when attempt is stale (connected / rejected / cancelled / unmounted / sid change). */
  isStillValid: () => boolean;
  start: () => void;
};

export type WebOutgoingRingbackGateResult = "skipped_native" | "started" | "pending" | "stale";

/**
 * Start Web ringback only after ownership is known.
 * Android/Web: Sync decision then start (no iOS plugin Async).
 * iOS: await Async; start only if native does not own and isStillValid.
 */
export function startWebOutgoingRingbackIfAllowed(
  args: StartWebOutgoingRingbackIfAllowedArgs
): WebOutgoingRingbackGateResult {
  const sid = normalizeCallId(args.callId);
  if (!sid) return "stale";

  try {
    if (shouldSkipWebOutgoingRingbackSync(args.kind)) {
      return "skipped_native";
    }

    const onNative =
      isCapacitorNativePlatform() && resolveCapacitorShellPlatform() === "ios";

    if (!onNative) {
      if (!args.isStillValid()) return "stale";
      args.start();
      return "started";
    }

    const token = beginOwnershipAttempt(sid);
    void shouldSkipWebOutgoingRingbackAsync(args.kind)
      .then((nativeOwns) => {
        if (!isOwnershipAttemptCurrent(sid, token)) return;
        if (nativeOwns) return;
        if (!args.isStillValid()) return;
        args.start();
      })
      .catch(() => {
        // Ownership probe failed — Web fallback if still valid (do not fail the call).
        if (!isOwnershipAttemptCurrent(sid, token)) return;
        if (!args.isStillValid()) return;
        args.start();
      });
    return "pending";
  } catch {
    if (!args.isStillValid()) return "stale";
    args.start();
    return "started";
  }
}
