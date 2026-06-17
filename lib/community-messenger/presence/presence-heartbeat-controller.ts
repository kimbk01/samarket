"use client";

import { isDebugMessengerEnabled } from "@/lib/community-messenger/debug/is-debug-messenger-enabled";
import type { CommunityMessengerPresenceState } from "@/lib/community-messenger/types";

export const PRESENCE_HEARTBEAT_INTERVAL_MS = 28_000;
export const PRESENCE_MIN_SAME_PAYLOAD_MS = 20_000;
const PRESENCE_BACKOFF_STEPS_MS = [30_000, 60_000, 120_000] as const;

export type PresenceSurface = "home" | "room" | "call" | "background";

type PresencePayload = {
  status: CommunityMessengerPresenceState;
  surface: PresenceSurface;
  roomId?: string;
  callId?: string;
};

type PresenceSignals = {
  documentVisible: boolean;
  channelSubscribed: boolean;
  lastActivityMs: number;
};

let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
let inFlight = false;
let lastSentAt = 0;
let lastPayloadKey = "";
let backoffStep = 0;
let backoffUntil = 0;
let loopActive = false;
let getSignalsRef: (() => PresenceSignals) | null = null;

function payloadKey(p: PresencePayload): string {
  return `${p.status}|${p.surface}|${p.roomId ?? ""}|${p.callId ?? ""}`;
}

function currentDocumentVisible(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState === "visible";
}

function deriveSurfaceFromPathname(): { surface: PresenceSurface; roomId?: string; callId?: string } {
  if (typeof window === "undefined") return { surface: "home" };
  const path = window.location.pathname;
  const roomMatch = path.match(/\/community-messenger\/rooms\/([^/]+)/);
  if (roomMatch?.[1]) {
    return { surface: "room", roomId: decodeURIComponent(roomMatch[1]) };
  }
  const callMatch = path.match(/\/community-messenger\/calls\/([^/]+)/);
  if (callMatch?.[1] && callMatch[1] !== "outgoing" && callMatch[1] !== "logs") {
    return { surface: "call", callId: decodeURIComponent(callMatch[1]) };
  }
  return { surface: "home" };
}

export function derivePresenceStatusFromSignals(signals: PresenceSignals): CommunityMessengerPresenceState {
  if (!signals.channelSubscribed) return "offline";
  if (!signals.documentVisible) return "away";
  const activityAge = Date.now() - signals.lastActivityMs;
  if (activityAge > 2 * 60_000) return "away";
  return "online";
}

function buildPayload(signals: PresenceSignals, overrides?: Partial<PresencePayload>): PresencePayload {
  const fromPath = deriveSurfaceFromPathname();
  const status =
    overrides?.status ??
  (signals.documentVisible ? derivePresenceStatusFromSignals(signals) : "away");
  const surface =
    overrides?.surface ??
    (signals.documentVisible ? fromPath.surface : "background");
  return {
    status,
    surface,
    roomId: overrides?.roomId ?? fromPath.roomId,
    callId: overrides?.callId ?? fromPath.callId,
  };
}

function logClientDebug(kind: string, fields: Record<string, unknown>) {
  if (!isDebugMessengerEnabled()) return;
  try {
    // eslint-disable-next-line no-console -- presence client 진단
    console.warn("[presence]", { kind, ...fields });
  } catch {
    /* ignore */
  }
}

function shouldSkipDuplicate(payload: PresencePayload, force: boolean): boolean {
  if (force) return false;
  const key = payloadKey(payload);
  const now = Date.now();
  if (key === lastPayloadKey && now - lastSentAt < PRESENCE_MIN_SAME_PAYLOAD_MS) {
    logClientDebug("skipped_duplicate_client", { key, deltaMs: now - lastSentAt });
    return true;
  }
  return false;
}

function onHttpFailure(status: number) {
  if (status < 500 && status !== 429) return;
  const step = Math.min(backoffStep, PRESENCE_BACKOFF_STEPS_MS.length - 1);
  const delay = PRESENCE_BACKOFF_STEPS_MS[step] ?? 120_000;
  backoffStep = Math.min(backoffStep + 1, PRESENCE_BACKOFF_STEPS_MS.length - 1);
  backoffUntil = Date.now() + delay;
  logClientDebug("heartbeat_backoff", { status, delayMs: delay, backoffStep });
}

function onHttpSuccess() {
  backoffStep = 0;
  backoffUntil = 0;
}

async function postPresenceBody(body: Record<string, unknown>): Promise<boolean> {
  if (inFlight) {
    logClientDebug("skipped_duplicate_client", { reason: "in_flight" });
    return false;
  }
  const now = Date.now();
  if (now < backoffUntil) {
    logClientDebug("heartbeat_backoff", { remainingMs: backoffUntil - now });
    return false;
  }

  inFlight = true;
  try {
    const res = await fetch("/api/community-messenger/presence", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (res.ok) {
      onHttpSuccess();
      return true;
    }
    onHttpFailure(res.status);
    return false;
  } catch {
    onHttpFailure(504);
    return false;
  } finally {
    inFlight = false;
  }
}

export async function sendPresenceHeartbeat(options?: {
  force?: boolean;
  signals?: PresenceSignals;
  overrides?: Partial<PresencePayload>;
}): Promise<void> {
  const signals = options?.signals ?? {
    documentVisible: currentDocumentVisible(),
    channelSubscribed: true,
    lastActivityMs: Date.now(),
  };
  const payload = buildPayload(signals, options?.overrides);
  if (shouldSkipDuplicate(payload, options?.force === true)) return;

  const body: Record<string, unknown> = {
    status: payload.status,
    surface: payload.surface,
  };
  if (payload.roomId) body.roomId = payload.roomId;
  if (payload.callId) body.callId = payload.callId;

  const ok = await postPresenceBody(body);
  if (ok) {
    lastSentAt = Date.now();
    lastPayloadKey = payloadKey(payload);
  }
}

export function sendPresenceSessionEnd(lastSeenAt: string): void {
  const body = JSON.stringify({ status: "offline", surface: "background", sessionEnd: true, lastSeenAt });
  try {
    const blob = new Blob([body], { type: "application/json" });
    navigator.sendBeacon?.("/api/community-messenger/presence", blob);
  } catch {
    void postPresenceBody({
      status: "offline",
      surface: "background",
      sessionEnd: true,
      lastSeenAt,
    });
  }
}

function clearHeartbeatTimer() {
  if (heartbeatTimer != null) {
    clearTimeout(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function scheduleNextHeartbeat() {
  clearHeartbeatTimer();
  if (!loopActive || !getSignalsRef) return;
  if (!currentDocumentVisible()) return;
  heartbeatTimer = setTimeout(() => {
    heartbeatTimer = null;
    if (!loopActive || !getSignalsRef) return;
    if (!currentDocumentVisible()) return;
    void sendPresenceHeartbeat({ signals: getSignalsRef() }).finally(() => {
      scheduleNextHeartbeat();
    });
  }, PRESENCE_HEARTBEAT_INTERVAL_MS);
}

export function startPresenceHeartbeatLoop(getSignals: () => PresenceSignals): void {
  getSignalsRef = getSignals;
  if (loopActive) return;
  loopActive = true;
  if (currentDocumentVisible()) {
    void sendPresenceHeartbeat({ force: true, signals: getSignals() });
    scheduleNextHeartbeat();
  }
}

export function stopPresenceHeartbeatLoop(): void {
  loopActive = false;
  getSignalsRef = null;
  clearHeartbeatTimer();
}

export function pausePresenceHeartbeatOnHidden(): void {
  clearHeartbeatTimer();
}

export function resumePresenceHeartbeatOnVisible(getSignals: () => PresenceSignals): void {
  getSignalsRef = getSignals;
  if (!loopActive) return;
  void sendPresenceHeartbeat({ force: true, signals: getSignals() });
  scheduleNextHeartbeat();
}

/** 테스트·리셋용 */
export function resetPresenceHeartbeatControllerForTests(): void {
  stopPresenceHeartbeatLoop();
  inFlight = false;
  lastSentAt = 0;
  lastPayloadKey = "";
  backoffStep = 0;
  backoffUntil = 0;
}
