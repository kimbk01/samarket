"use client";

import { logCallConnectingSurfaceHidden, logCallConnectingSurfaceVisible } from "@/lib/community-messenger/call-connecting-surface/call-connecting-surface-trace";

export type CallConnectingSurfaceState = {
  sessionId: string;
  source: string;
  visibleAt: number;
} | null;

let state: CallConnectingSurfaceState = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function getCallConnectingSurfaceState(): CallConnectingSurfaceState {
  return state;
}

export function subscribeCallConnectingSurface(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function requestCallConnectingSurface(sessionId: string, source: string): void {
  const sid = sessionId.trim();
  if (!sid) return;
  if (state?.sessionId === sid) return;
  state = { sessionId: sid, source, visibleAt: Date.now() };
  logCallConnectingSurfaceVisible({ sessionId: sid, source });
  emit();
}

export function hideCallConnectingSurface(
  sessionId: string,
  reason: string,
  extra: Record<string, unknown> = {}
): void {
  const sid = sessionId.trim();
  if (!sid || !state || state.sessionId !== sid) return;
  logCallConnectingSurfaceHidden({ sessionId: sid, reason, ...extra });
  state = null;
  emit();
}

export function hideCallConnectingSurfaceAny(reason: string): void {
  if (!state) return;
  const sid = state.sessionId;
  logCallConnectingSurfaceHidden({ sessionId: sid, reason });
  state = null;
  emit();
}

export function notifyCallScreenPaintedForConnectingSurface(sessionId: string): void {
  hideCallConnectingSurface(sessionId, "call_screen_painted");
}

export function resetCallConnectingSurfaceForTests(): void {
  state = null;
  listeners.clear();
}
