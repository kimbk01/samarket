"use client";

import { callV4FetchSessionForCallerPoll } from "@/lib/community-messenger/call-v4/call-v4-api";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import { readCallV4Identity, readCallV4Phase } from "@/lib/community-messenger/call-v4/call-v4-store";
import type { CallV4Phase } from "@/lib/community-messenger/call-v4/call-v4-types";
import {
  subscribeCommunityMessengerCallInviteBroadcast,
} from "@/lib/community-messenger/call-invite-realtime-broadcast";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CALL_HEARTBEAT_INTERVAL_MS } from "@/lib/call/native/call-heartbeat-watchdog";
import { isNativeEstablishmentOwned } from "@/lib/call/native/native-outgoing-bridge";

const CONNECTED_TERMINAL_POLL_MS = 1_000;
const TERMINAL_STATUSES = new Set(["rejected", "cancelled", "canceled", "ended", "missed", "failed"]);
const WATCH_PHASES = new Set<CallV4Phase>(["joining", "connected"]);

type TerminalCheckSource = "agora" | "realtime" | "poll" | "native_released";

let pollTimer: ReturnType<typeof setInterval> | null = null;
let watchedCallId: string | null = null;
/** R3-b: the Native Runtime owns this connected call (Android/iOS native voice·video). */
let watchedNativeOwned = false;
let nativeTickInFlight = false;
let lastNativeFallbackCheckAt = 0;
let terminalHandler:
  | ((callId: string, status: string, source: TerminalCheckSource) => Promise<void> | void)
  | null = null;
let realtimeChannel: ReturnType<SupabaseClient["channel"]> | null = null;
let realtimeHangupSubscribed = false;

function normalizeStatus(status: string | null | undefined): string {
  const normalized = (status ?? "").trim().toLowerCase();
  if (normalized === "canceled") return "cancelled";
  if (TERMINAL_STATUSES.has(normalized)) return normalized;
  return "";
}

function isCurrentWatchCall(callId: string): boolean {
  const sid = callId.trim();
  if (!sid) return false;
  const identity = readCallV4Identity();
  const phase = readCallV4Phase();
  return watchedCallId === sid && identity?.callId === sid && WATCH_PHASES.has(phase);
}

async function confirmRemoteTerminalStatus(callId: string, source: TerminalCheckSource): Promise<void> {
  const sid = callId.trim();
  if (!sid) return;
  if (!isCurrentWatchCall(sid)) {
    logCallV4("remote_terminal_ignored", { callId: sid, source, reason: "not_current_connected_call" });
    return;
  }

  const result = await callV4FetchSessionForCallerPoll(sid).catch(() => null);
  const status = normalizeStatus(result?.session?.status ?? (result?.notFound ? "failed" : ""));
  if (!status) {
    logCallV4("remote_terminal_ignored", {
      callId: sid,
      source,
      reason: result?.session?.status ? "not_terminal" : "status_unavailable",
    });
    return;
  }

  logCallV4("remote_terminal_status_confirmed", { callId: sid, status, source });
  await terminalHandler?.(sid, status, source);
}

function readPayloadCallId(payload: Record<string, unknown>): string {
  const raw = payload.sessionId ?? payload.callId;
  return typeof raw === "string" ? raw.trim() : "";
}

export function registerCallV4ConnectedTerminalHandler(
  handler: (callId: string, status: string, source: TerminalCheckSource) => Promise<void> | void,
): () => void {
  terminalHandler = handler;
  return () => {
    if (terminalHandler === handler) terminalHandler = null;
  };
}

/**
 * R3-b (docs/audit/messenger-2026-10-26-r3-call-session-poll-plan.md §8): a native-owned call is
 * ended by the Native Runtime (Agora peer-left, FCM terminal push, local end), which pushes the
 * terminal to the Web store. Measured 10-26: the 1s GET never detected an end first. While native
 * still owns the call the tick only asks native (no HTTP); once native releases it, one GET confirms
 * and finalizes. HTTP fallback runs only while the Realtime hangup channel is down, on the server
 * heartbeat cadence. Web-established (JS Agora) calls keep the 1s server poll.
 */
async function tickNativeOwnedTerminalWatch(sid: string): Promise<void> {
  if (nativeTickInFlight || !isCurrentWatchCall(sid)) return;
  nativeTickInFlight = true;
  try {
    if (!(await isNativeEstablishmentOwned(sid))) {
      await confirmRemoteTerminalStatus(sid, "native_released");
      return;
    }
    if (realtimeHangupSubscribed) return;
    const now = Date.now();
    if (now - lastNativeFallbackCheckAt < CALL_HEARTBEAT_INTERVAL_MS) return;
    lastNativeFallbackCheckAt = now;
    await confirmRemoteTerminalStatus(sid, "poll");
  } finally {
    nativeTickInFlight = false;
  }
}

export function startCallV4ConnectedTerminalWatch(
  callId: string,
  opts: { nativeOwned?: boolean } = {},
): void {
  const sid = callId.trim();
  if (!sid) return;
  if (watchedCallId === sid && pollTimer) return;
  stopCallV4ConnectedTerminalWatch();
  watchedCallId = sid;
  watchedNativeOwned = opts.nativeOwned === true;
  lastNativeFallbackCheckAt = Date.now();
  logCallV4("remote_terminal_watch_start", {
    callId: sid,
    mode: watchedNativeOwned ? "native_owner" : "server_poll",
  });
  pollTimer = setInterval(() => {
    if (watchedNativeOwned) {
      void tickNativeOwnedTerminalWatch(sid);
      return;
    }
    void confirmRemoteTerminalStatus(sid, "poll");
  }, CONNECTED_TERMINAL_POLL_MS);
}

export function stopCallV4ConnectedTerminalWatch(callId?: string): void {
  const sid = callId?.trim() ?? "";
  if (sid && watchedCallId && watchedCallId !== sid) return;
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  watchedCallId = null;
  watchedNativeOwned = false;
  nativeTickInFlight = false;
}

export function triggerCallV4RemoteTerminalCheckFromAgora(callId: string, uid?: string | number | null): void {
  const sid = callId.trim();
  if (!sid) return;
  logCallV4("agora_remote_left_detected", { callId: sid, uid: uid ?? null });
  void confirmRemoteTerminalStatus(sid, "agora");
}

export function startCallV4TerminalRealtimeWatch(userId: string): () => void {
  const uid = userId.trim();
  const sb = getSupabaseClient();
  if (!uid || !sb) return () => undefined;
  realtimeHangupSubscribed = false;
  realtimeChannel = subscribeCommunityMessengerCallInviteBroadcast(sb, uid, {
    onRing: () => undefined,
    onHangup: (payload) => {
      const callId = readPayloadCallId(payload);
      if (!callId) return;
      void confirmRemoteTerminalStatus(callId, "realtime");
    },
    onStatus: (status) => {
      realtimeHangupSubscribed = status === "SUBSCRIBED";
    },
  });
  return () => {
    const ch = realtimeChannel;
    realtimeChannel = null;
    realtimeHangupSubscribed = false;
    if (ch) void sb.removeChannel(ch);
  };
}

export function resetCallV4ConnectedTerminalWatchForTests(): void {
  stopCallV4ConnectedTerminalWatch();
  terminalHandler = null;
  realtimeChannel = null;
  realtimeHangupSubscribed = false;
}

