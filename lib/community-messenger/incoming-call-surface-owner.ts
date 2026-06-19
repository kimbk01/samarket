"use client";

import { logDibayCall } from "@/lib/community-messenger/call-orchestrator";

/** callId 기준 수신 UI 단일 소유 — 동시에 2개 surface visible 금지 */
export type IncomingCallSurfaceOwner =
  | "none"
  | "native_fullscreen"
  | "native_foreground_pill"
  | "web_foreground_overlay"
  | "call_screen"
  | "terminal_suppressed";

export type IncomingCallSurfaceConsumedReason =
  | "accepted"
  | "declined"
  | "missed"
  | "ended"
  | "rejected"
  | "cancelled"
  | "blocked"
  | "busy";

type SurfaceEntry = {
  owner: IncomingCallSurfaceOwner;
  claimedAt: number;
  source: string;
  consumedReason?: IncomingCallSurfaceConsumedReason;
};

const SYNC_EVENT = "dibay:incoming-call-surface-sync";

const surfacesByCallId = new Map<string, SurfaceEntry>();

function normalizeCallId(callId: string | null | undefined): string {
  return callId?.trim() ?? "";
}

function notifySync(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SYNC_EVENT));
}

export function subscribeIncomingCallSurfaceOwner(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => onStoreChange();
  window.addEventListener(SYNC_EVENT, handler);
  return () => window.removeEventListener(SYNC_EVENT, handler);
}

export function getIncomingCallSurfaceOwner(callId: string | null | undefined): IncomingCallSurfaceOwner {
  const sid = normalizeCallId(callId);
  if (!sid) return "none";
  return surfacesByCallId.get(sid)?.owner ?? "none";
}

export function isIncomingCallSurfaceVisible(callId: string | null | undefined): boolean {
  const owner = getIncomingCallSurfaceOwner(callId);
  return owner !== "none" && owner !== "terminal_suppressed";
}

export function isIncomingCallSurfaceTerminal(callId: string | null | undefined): boolean {
  return getIncomingCallSurfaceOwner(callId) === "terminal_suppressed";
}

const OWNER_RANK: Record<IncomingCallSurfaceOwner, number> = {
  none: 0,
  web_foreground_overlay: 1,
  native_foreground_pill: 2,
  call_screen: 3,
  native_fullscreen: 4,
  terminal_suppressed: 5,
};

function canPreemptOwner(
  current: IncomingCallSurfaceOwner,
  next: IncomingCallSurfaceOwner,
): boolean {
  if (current === "none") return true;
  if (next === "terminal_suppressed") return true;
  if (current === "terminal_suppressed") return false;
  if (current === next) return true;
  /** Lock/background full-screen — Web incoming surfaces 금지 */
  if (current === "native_fullscreen" && next !== "native_fullscreen") {
    return false;
  }
  if (current === "call_screen" && next === "web_foreground_overlay") {
    return false;
  }
  if (current === "native_foreground_pill" && next === "web_foreground_overlay") {
    return false;
  }
  return OWNER_RANK[next] >= OWNER_RANK[current];
}

export function claimIncomingCallSurface(
  callId: string,
  owner: IncomingCallSurfaceOwner,
  source = "client",
): { ok: true } | { ok: false; reason: string; currentOwner: IncomingCallSurfaceOwner } {
  const sid = normalizeCallId(callId);
  if (!sid || owner === "none") {
    return { ok: false, reason: "invalid_call_id_or_owner", currentOwner: "none" };
  }

  const current = getIncomingCallSurfaceOwner(sid);
  if (current === "terminal_suppressed" && owner !== "terminal_suppressed") {
    logDibayCall("incoming_ignored_consumed", {
      sessionId: sid,
      callId: sid,
      source,
      reason: "surface_terminal",
      requestedOwner: owner,
    });
    return { ok: false, reason: "terminal_suppressed", currentOwner: current };
  }

  if (current !== "none" && current !== owner && !canPreemptOwner(current, owner)) {
    console.info("[call-state] surface_claim_blocked", {
      callId: sid,
      requestedOwner: owner,
      currentOwner: current,
      source,
    });
    return { ok: false, reason: "owner_conflict", currentOwner: current };
  }

  surfacesByCallId.set(sid, {
    owner,
    claimedAt: Date.now(),
    source,
    consumedReason: owner === "terminal_suppressed" ? surfacesByCallId.get(sid)?.consumedReason : undefined,
  });

  if (current !== owner) {
    console.info("[call-state] surface_claimed", { callId: sid, owner, from: current, source });
    logDibayCall("surface_mounted", {
      sessionId: sid,
      callId: sid,
      owner,
      from: current,
      source,
    });
  }

  notifySync();
  return { ok: true };
}

export function releaseIncomingCallSurface(
  callId: string,
  owner: IncomingCallSurfaceOwner,
  source = "client",
): void {
  const sid = normalizeCallId(callId);
  if (!sid) return;
  const entry = surfacesByCallId.get(sid);
  if (!entry || entry.owner !== owner) return;
  if (entry.owner === "terminal_suppressed") return;

  surfacesByCallId.delete(sid);
  console.info("[call-state] surface_released", { callId: sid, owner, source });
  logDibayCall("surface_unmount", { sessionId: sid, callId: sid, owner, source });
  notifySync();
}

export function markIncomingCallSurfaceConsumed(
  callId: string,
  reason: IncomingCallSurfaceConsumedReason,
  source = "client",
): void {
  const sid = normalizeCallId(callId);
  if (!sid) return;
  surfacesByCallId.set(sid, {
    owner: "terminal_suppressed",
    claimedAt: Date.now(),
    source,
    consumedReason: reason,
  });
  console.info("[call-state] surface_consumed", { callId: sid, reason, source });
  logDibayCall("incoming_consumed", { sessionId: sid, callId: sid, reason, source: `surface_${source}` });
  notifySync();
}

/** 렌더 직전 — claim 성공 또는 이미 동일 owner */
export function canRenderIncomingCallSurface(
  callId: string,
  owner: IncomingCallSurfaceOwner,
): boolean {
  const sid = normalizeCallId(callId);
  if (!sid) return false;
  const current = getIncomingCallSurfaceOwner(sid);
  if (current === "terminal_suppressed") return false;
  if (current === owner) return true;
  if (current === "none") {
    return claimIncomingCallSurface(sid, owner, "can_render").ok;
  }
  return canPreemptOwner(current, owner) && claimIncomingCallSurface(sid, owner, "can_render_preempt").ok;
}

/** Ringing 상태에서 WebView 자동 `/calls/:id` 진입 금지 — Native 수신 UI 단독 */
export function isRingingOnlyIncomingCallRoute(path: string | null | undefined): boolean {
  const raw = path?.trim() ?? "";
  if (!raw.startsWith("/community-messenger/calls/")) return false;
  if (raw.includes("/community-messenger/calls/outgoing")) return false;
  if (raw.includes("action=accept") || raw.includes("callAction=accept")) return false;
  if (raw.includes("nativeAccept=1")) return false;
  if (raw.includes("source=native_resume")) return false;
  if (raw.includes("incomingPreview=1")) return false;
  if (raw.includes("mode=active")) return false;
  return true;
}

export function resetIncomingCallSurfaceOwner(callId?: string | null): void {
  if (callId) {
    const sid = normalizeCallId(callId);
    if (!sid) return;
    surfacesByCallId.delete(sid);
  } else {
    surfacesByCallId.clear();
  }
  notifySync();
}

/** @internal tests */
export function readIncomingCallSurfaceEntryForTest(callId: string): SurfaceEntry | undefined {
  return surfacesByCallId.get(normalizeCallId(callId));
}
