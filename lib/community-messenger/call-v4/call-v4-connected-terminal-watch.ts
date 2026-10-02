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

const CONNECTED_TERMINAL_POLL_MS = 1_000;
const TERMINAL_STATUSES = new Set(["rejected", "cancelled", "canceled", "ended", "missed", "failed"]);
const WATCH_PHASES = new Set<CallV4Phase>(["joining", "connected"]);

let pollTimer: ReturnType<typeof setTimeout> | null = null;
let watchedCallId: string | null = null;
let watchInFlight = false;
let terminalHandler:
  | ((callId: string, status: string, source: "agora" | "realtime" | "poll") => Promise<void> | void)
  | null = null;
let realtimeChannel: ReturnType<SupabaseClient["channel"]> | null = null;

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

async function confirmRemoteTerminalStatus(
  callId: string,
  source: "agora" | "realtime" | "poll",
): Promise<void> {
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
  handler: (callId: string, status: string, source: "agora" | "realtime" | "poll") => Promise<void> | void,
): () => void {
  terminalHandler = handler;
  return () => {
    if (terminalHandler === handler) terminalHandler = null;
  };
}

export function startCallV4ConnectedTerminalWatch(callId: string): void {
  const sid = callId.trim();
  if (!sid) return;
  if (watchedCallId === sid && pollTimer) return;
  stopCallV4ConnectedTerminalWatch();
  watchedCallId = sid;
  logCallV4("remote_terminal_watch_start", { callId: sid });

  // COST-01: setInterval → 단일 in-flight setTimeout 체인(겹침 방지) + 화면 보일 때만 폴링. 주기(1s) 유지.
  const scheduleNext = () => {
    if (watchedCallId !== sid) return;
    pollTimer = setTimeout(() => {
      pollTimer = null;
      void tick().finally(scheduleNext);
    }, CONNECTED_TERMINAL_POLL_MS);
  };
  const tick = async () => {
    if (watchedCallId !== sid || watchInFlight) return;
    if (typeof document !== "undefined" && document.hidden) return;
    watchInFlight = true;
    try {
      await confirmRemoteTerminalStatus(sid, "poll");
    } catch {
      /* COST-01: 타임아웃/네트워크 실패 — 다음 폴에서 재시도. */
    } finally {
      watchInFlight = false;
    }
  };
  void tick().finally(scheduleNext);
}

export function stopCallV4ConnectedTerminalWatch(callId?: string): void {
  const sid = callId?.trim() ?? "";
  if (sid && watchedCallId && watchedCallId !== sid) return;
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  watchedCallId = null;
  watchInFlight = false;
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
  realtimeChannel = subscribeCommunityMessengerCallInviteBroadcast(sb, uid, {
    onRing: () => undefined,
    onHangup: (payload) => {
      const callId = readPayloadCallId(payload);
      if (!callId) return;
      void confirmRemoteTerminalStatus(callId, "realtime");
    },
  });
  return () => {
    const ch = realtimeChannel;
    realtimeChannel = null;
    if (ch) void sb.removeChannel(ch);
  };
}

export function resetCallV4ConnectedTerminalWatchForTests(): void {
  stopCallV4ConnectedTerminalWatch();
  terminalHandler = null;
  realtimeChannel = null;
}

