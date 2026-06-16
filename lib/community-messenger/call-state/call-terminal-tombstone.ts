/**
 * Terminal tombstone SSOT — Web latch + optional native mirror.
 *
 * CONTRACT: After latch, same callId must not ring or show incoming UI.
 * See docs/community-messenger/incoming-call-ssot.md
 */
import {
  type CallConsumedReason,
  INCOMING_REMOTE_HARD_CLEAR_KEEP_MS,
  isDibayCallConsumed,
  isIncomingSessionHardCleared,
  markCallConsumed,
  markCallConsumedFromNativeHydrate,
} from "@/lib/community-messenger/incoming-call-state";

export type { CallConsumedReason };

/** Per-host tombstone context (Global ref maps passed in). */
export type CallTerminalTombstoneContext = {
  hardClearedAt: Map<string, number>;
  /** Test hook / future sync — production hydrate goes through native bridge */
  nativeConsumedIds?: ReadonlySet<string>;
};

function normalizeCallId(callId: string | null | undefined): string {
  return callId?.trim() ?? "";
}

export function isNativeCallTerminal(
  callId: string | null | undefined,
  ctx: CallTerminalTombstoneContext
): boolean {
  const sid = normalizeCallId(callId);
  if (!sid || !ctx.nativeConsumedIds) return false;
  return ctx.nativeConsumedIds.has(sid);
}

/** Terminal latch — consumed or hard-cleared or native tombstone. */
export function isCallTerminal(
  callId: string | null | undefined,
  ctx: CallTerminalTombstoneContext,
  now = Date.now()
): boolean {
  const sid = normalizeCallId(callId);
  if (!sid) return false;
  if (isDibayCallConsumed(sid, now)) return true;
  if (isIncomingSessionHardCleared(sid, ctx.hardClearedAt, now)) return true;
  if (isNativeCallTerminal(sid, ctx)) return true;
  return false;
}

/** May show incoming UI or attempt ring sync for this callId. */
export function canShowIncoming(
  callId: string | null | undefined,
  ctx: CallTerminalTombstoneContext,
  now = Date.now()
): boolean {
  const sid = normalizeCallId(callId);
  if (!sid) return false;
  return !isCallTerminal(sid, ctx, now);
}

/** Latch terminal — Web consumed + hardClear timestamp. */
export function latchCallTerminal(
  callId: string | null | undefined,
  reason: CallConsumedReason,
  ctx: CallTerminalTombstoneContext
): string {
  const sid = normalizeCallId(callId);
  if (!sid) return "";
  markCallConsumed(sid, reason);
  ctx.hardClearedAt.set(sid, Date.now());
  return sid;
}

/** Hydrate from native store without writing back to native (no loop). */
export function hydrateCallTerminalFromNative(
  callId: string | null | undefined,
  reason: CallConsumedReason,
  ctx: CallTerminalTombstoneContext
): void {
  const sid = normalizeCallId(callId);
  if (!sid || isDibayCallConsumed(sid)) return;
  markCallConsumedFromNativeHydrate(sid, reason);
  ctx.hardClearedAt.set(sid, Date.now());
}

export const CALL_TERMINAL_TOMBSTONE_TTL_MS = INCOMING_REMOTE_HARD_CLEAR_KEEP_MS;
