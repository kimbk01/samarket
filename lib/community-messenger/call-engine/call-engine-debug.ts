"use client";

import type { CallEngineState } from "@/lib/community-messenger/call-engine/call-engine-types";

/** Telegram-style instant UX 측정·red-team 계약용 이벤트 (console.info). */
export const CALL_UX_DEBUG_EVENTS = [
  "call_outgoing_tap",
  "call_shell_or_route_requested",
  "call_engine_create_start",
  "call_engine_create_success",
  "call_route_enter",
  "call_media_prepare_start",
  "media_prime_started",
  "media_prime_resolved",
  "call_media_prepare_failed",
  "call_media_preview_ready",
  "call_push_dispatch_start",
  "call_incoming_surface_show",
  "call_accept_tap",
  "call_accept_patch_start",
  "call_accept_patch_success",
  "call_agora_join_start",
  "call_agora_join_success",
  "call_terminal_start",
  "call_terminal_ui_closed",
] as const;

export type CallUxDebugEvent = (typeof CALL_UX_DEBUG_EVENTS)[number];

export function logCallUxEvent(event: CallUxDebugEvent, payload: Record<string, unknown> = {}): void {
  console.info("[call-ux]", event, { ...payload, ts: Date.now() });
}

export function logCallEngineEvent(event: string, payload: Record<string, unknown>): void {
  console.info("[call-engine]", event, payload);
}

export function logCallEngineStateTransition(callId: string, from: CallEngineState, to: CallEngineState): void {
  logCallEngineEvent("state_transition", { callId, sessionId: callId, from, to });
}
