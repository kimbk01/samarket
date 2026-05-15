"use client";

import { useCmRoomOpeningOverlayStore } from "@/lib/community-messenger/room/cm-room-opening-overlay-store";
import {
  getCmRoomEntryBootstrapMeta,
  isCmRoomEntryMilestoneFinalized,
} from "@/lib/community-messenger/room/cm-room-entry-instrumentation";
import { getCmRoomEntrySessionTapT0 } from "@/lib/community-messenger/room/cm-room-entry-timing-session";
import { cmMessengerPerfVerboseLog } from "@/lib/community-messenger/room/cm-messenger-perf-verbose-log";

export type CmColdEntryPathPayload = {
  roomId: string;
  used_cached_snapshot: boolean;
  used_prefetch: boolean;
  cold_bootstrap: boolean;
  overlay_mounted_ms: number | null;
  shell_finalized: boolean;
  composer_finalized: boolean;
  bootstrap_completed_ms: number | null;
};

let lastColdEntryLogKey = "";

function msSinceTap(at: number): number | null {
  const tap = getCmRoomEntrySessionTapT0();
  if (tap <= 0 || at <= 0) return null;
  return Math.round(at - tap);
}

export function logCmColdEntryPath(payload: CmColdEntryPathPayload): void {
  const key = [
    payload.roomId,
    payload.shell_finalized ? 1 : 0,
    payload.composer_finalized ? 1 : 0,
    payload.bootstrap_completed_ms ?? "n",
    payload.used_cached_snapshot ? 1 : 0,
  ].join("|");
  if (key === lastColdEntryLogKey) return;
  lastColdEntryLogKey = key;
  cmMessengerPerfVerboseLog("[cm-cold-entry-path]", payload);
}

export function noteCmColdEntryShellFinalized(roomId: string, coldBootstrap: boolean): void {
  const id = String(roomId ?? "").trim();
  if (!id) return;
  const overlay = useCmRoomOpeningOverlayStore.getState();
  const meta = getCmRoomEntryBootstrapMeta();
  logCmColdEntryPath({
    roomId: id,
    used_cached_snapshot: meta.used_cached_snapshot,
    used_prefetch: meta.used_prefetch,
    cold_bootstrap: coldBootstrap,
    overlay_mounted_ms:
      overlay.openingRoomId === id && overlay.shellVisibleAt > 0
        ? msSinceTap(overlay.shellVisibleAt)
        : null,
    shell_finalized: isCmRoomEntryMilestoneFinalized("room_shell_visible_ms"),
    composer_finalized: isCmRoomEntryMilestoneFinalized("composer_visible_ms"),
    bootstrap_completed_ms: null,
  });
}

export function noteCmColdEntryComposerFinalized(roomId: string, coldBootstrap: boolean): void {
  const id = String(roomId ?? "").trim();
  if (!id) return;
  const overlay = useCmRoomOpeningOverlayStore.getState();
  const meta = getCmRoomEntryBootstrapMeta();
  logCmColdEntryPath({
    roomId: id,
    used_cached_snapshot: meta.used_cached_snapshot,
    used_prefetch: meta.used_prefetch,
    cold_bootstrap: coldBootstrap,
    overlay_mounted_ms:
      overlay.openingRoomId === id && overlay.shellVisibleAt > 0
        ? msSinceTap(overlay.shellVisibleAt)
        : null,
    shell_finalized: isCmRoomEntryMilestoneFinalized("room_shell_visible_ms"),
    composer_finalized: isCmRoomEntryMilestoneFinalized("composer_visible_ms"),
    bootstrap_completed_ms: null,
  });
}

export function noteCmColdEntryBootstrapCompleted(roomId: string, coldBootstrap: boolean): void {
  const id = String(roomId ?? "").trim();
  if (!id || typeof performance === "undefined") return;
  const tap = getCmRoomEntrySessionTapT0();
  const bootstrapCompletedMs = tap > 0 ? Math.round(performance.now() - tap) : null;
  const overlay = useCmRoomOpeningOverlayStore.getState();
  const meta = getCmRoomEntryBootstrapMeta();
  logCmColdEntryPath({
    roomId: id,
    used_cached_snapshot: meta.used_cached_snapshot,
    used_prefetch: meta.used_prefetch,
    cold_bootstrap: coldBootstrap,
    overlay_mounted_ms:
      overlay.openingRoomId === id && overlay.shellVisibleAt > 0
        ? msSinceTap(overlay.shellVisibleAt)
        : null,
    shell_finalized: isCmRoomEntryMilestoneFinalized("room_shell_visible_ms"),
    composer_finalized: isCmRoomEntryMilestoneFinalized("composer_visible_ms"),
    bootstrap_completed_ms: bootstrapCompletedMs,
  });
}

export function resetCmColdEntryPathForTests(): void {
  lastColdEntryLogKey = "";
}
