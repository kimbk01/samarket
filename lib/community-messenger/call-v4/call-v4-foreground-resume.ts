"use client";

import type { NativeActiveCallSnapshot } from "@/lib/call/native/native-call-service";
import { peekNativeOwnedWebV4UiBlockSync } from "@/lib/call/native/native-owned-web-v4-ui-guard";
import { readTerminalCallRecoverySuppress } from "@/lib/community-messenger/call-active-session-recovery";
import { expandCommunityCallFromDock } from "@/lib/community-messenger/call-presentation-ownership";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import { isCallV4TelegramLaneEnabled } from "@/lib/community-messenger/call-v4/call-v4-flag";
import { readCallConsumedReason } from "@/lib/community-messenger/incoming-call-state";
import { buildCallV4ScreenHref } from "@/lib/community-messenger/call-v4/call-v4-route";
import { isCallV4DedicatedSessionPath } from "@/lib/community-messenger/call-v4/call-v4-session-path";
import type { CallV4Phase } from "@/lib/community-messenger/call-v4/call-v4-types";

export type CallV4ForegroundResumeSkipReason =
  | "lane_off"
  | "not_connected"
  | "no_active_call"
  | "native_call_mismatch"
  | "already_on_call_screen"
  | "terminal_status"
  | "duplicate_restore"
  | "native_owned_ui_forbidden";

export type CallV4ForegroundResumeDecision =
  | { action: "restore"; callId: string; href: string }
  | { action: "skip"; reason: CallV4ForegroundResumeSkipReason; callId?: string | null };

const TERMINAL_CONSUMED = new Set(["ended", "declined", "cancelled", "missed", "rejected"]);

export function evaluateCallV4ForegroundResume(input: {
  laneEnabled?: boolean;
  phase: CallV4Phase;
  pathname: string;
  storeCallId: string | null;
  nativeCallId: string | null;
  nativeSnapshot: NativeActiveCallSnapshot | null;
  dedupeKey: string | null;
  lastRestoreKey: string | null;
}): CallV4ForegroundResumeDecision {
  const laneEnabled = input.laneEnabled ?? isCallV4TelegramLaneEnabled();
  const storeCallId = input.storeCallId?.trim() ?? "";
  const nativeCallId = input.nativeCallId?.trim() ?? "";
  const callId = storeCallId || nativeCallId;

  if (!laneEnabled) {
    return { action: "skip", reason: "lane_off", callId: callId || null };
  }

  if (input.phase !== "connected") {
    return { action: "skip", reason: "not_connected", callId: callId || null };
  }

  if (!nativeCallId) {
    return { action: "skip", reason: "no_active_call", callId: storeCallId || null };
  }

  if (storeCallId && storeCallId !== nativeCallId) {
    return { action: "skip", reason: "native_call_mismatch", callId: storeCallId };
  }

  const sid = storeCallId || nativeCallId;

  if (peekNativeOwnedWebV4UiBlockSync(sid, "foreground_resume")) {
    return { action: "skip", reason: "native_owned_ui_forbidden", callId: sid };
  }

  if (isCallV4DedicatedSessionPath(input.pathname, sid)) {
    return { action: "skip", reason: "already_on_call_screen", callId: sid };
  }

  const suppress = readTerminalCallRecoverySuppress();
  if (suppress?.sessionId === sid) {
    return { action: "skip", reason: "terminal_status", callId: sid };
  }

  const consumed = readCallConsumedReason(sid);
  if (consumed && TERMINAL_CONSUMED.has(consumed)) {
    return { action: "skip", reason: "terminal_status", callId: sid };
  }

  if (input.nativeSnapshot?.connected === false) {
    return { action: "skip", reason: "terminal_status", callId: sid };
  }

  if (input.dedupeKey && input.lastRestoreKey === input.dedupeKey) {
    return { action: "skip", reason: "duplicate_restore", callId: sid };
  }

  return {
    action: "restore",
    callId: sid,
    href: buildCallV4ScreenHref(sid, "foreground_resume"),
  };
}

export function applyCallV4ForegroundResumeRestore(input: {
  callId: string;
  href: string;
  trigger: string;
}): void {
  const sid = input.callId.trim();
  expandCommunityCallFromDock(sid);
  logCallV4("call_v4_foreground_resume_restore", {
    callId: sid,
    href: input.href,
    trigger: input.trigger,
  });
}

export function logCallV4ForegroundResumeDetected(input: {
  callId: string | null;
  trigger: string;
  pathname: string;
  phase: CallV4Phase;
}): void {
  logCallV4("call_v4_foreground_resume_detected", {
    callId: input.callId,
    trigger: input.trigger,
    pathname: input.pathname,
    phase: input.phase,
  });
}

export function logCallV4ForegroundResumeSkip(input: {
  callId: string | null;
  reason: CallV4ForegroundResumeSkipReason;
  trigger: string;
  pathname?: string;
}): void {
  logCallV4("call_v4_foreground_resume_skip", {
    callId: input.callId,
    reason: input.reason,
    trigger: input.trigger,
    pathname: input.pathname ?? null,
  });
}

export function buildCallV4ForegroundResumeDedupeKey(callId: string, pathname: string): string {
  return `${callId.trim()}:${pathname.trim()}`;
}
