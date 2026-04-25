"use client";

import { messengerMonitorRealtimeSilentScope } from "@/lib/community-messenger/monitoring/client";

export type CommunityMessengerRealtimeScopeHealth = {
  scope: string;
  lastStatus: string | null;
  subscribedAt: number | null;
  lastSignalAt: number | null;
  lastHealthyAt: number | null;
  lastFailureAt: number | null;
  lastFailureStatus: string | null;
  lastSilentAlertAt: number | null;
  silentAfterMs: number;
};

const DEFAULT_SILENT_AFTER_MS = 15_000;
const SILENT_ALERT_MIN_GAP_MS = 20_000;
const SCOPE_HEALTH_MAX_SCOPES = 150;
const scopeHealthMap = new Map<string, CommunityMessengerRealtimeScopeHealth>();

function normalizeScope(scope: string): string {
  return String(scope ?? "").trim();
}

function getOrCreateScopeHealth(scope: string): CommunityMessengerRealtimeScopeHealth {
  const normalized = normalizeScope(scope);
  let current = scopeHealthMap.get(normalized);
  if (current) return current;
  current = {
    scope: normalized,
    lastStatus: null,
    subscribedAt: null,
    lastSignalAt: null,
    lastHealthyAt: null,
    lastFailureAt: null,
    lastFailureStatus: null,
    lastSilentAlertAt: null,
    silentAfterMs: DEFAULT_SILENT_AFTER_MS,
  };
  scopeHealthMap.set(normalized, current);
  while (scopeHealthMap.size > SCOPE_HEALTH_MAX_SCOPES) {
    const k = scopeHealthMap.keys().next().value;
    if (k === undefined) break;
    scopeHealthMap.delete(k);
  }
  return current;
}

export function registerCommunityMessengerRealtimeScope(args: {
  scope: string;
  status: string;
  silentAfterMs?: number;
}): void {
  const scope = normalizeScope(args.scope);
  if (!scope) return;
  const now = Date.now();
  const row = getOrCreateScopeHealth(scope);
  row.silentAfterMs = Math.max(1_000, Math.floor(args.silentAfterMs ?? row.silentAfterMs ?? DEFAULT_SILENT_AFTER_MS));
  row.lastStatus = args.status;
  if (args.status === "SUBSCRIBED") {
    row.subscribedAt = now;
    row.lastHealthyAt = now;
    row.lastFailureAt = null;
    row.lastFailureStatus = null;
  } else if (args.status === "TIMED_OUT" || args.status === "CHANNEL_ERROR" || args.status === "CLOSED") {
    row.lastFailureAt = now;
    row.lastFailureStatus = args.status;
  }
}

export function markCommunityMessengerRealtimeScopeSignal(scopeRaw: string): void {
  const scope = normalizeScope(scopeRaw);
  if (!scope) return;
  const now = Date.now();
  const row = getOrCreateScopeHealth(scope);
  row.lastSignalAt = now;
  row.lastHealthyAt = now;
}

export function clearCommunityMessengerRealtimeScope(scopeRaw: string): void {
  const scope = normalizeScope(scopeRaw);
  if (!scope) return;
  scopeHealthMap.delete(scope);
}

export function getCommunityMessengerRealtimeScopeHealth(scopeRaw: string): CommunityMessengerRealtimeScopeHealth | null {
  const scope = normalizeScope(scopeRaw);
  if (!scope) return null;
  return scopeHealthMap.get(scope) ?? null;
}

export function isCommunityMessengerRealtimeScopeHealthy(
  scopeRaw: string,
  opts?: { silentAfterMs?: number }
): boolean {
  const scope = normalizeScope(scopeRaw);
  if (!scope) return false;
  const row = scopeHealthMap.get(scope);
  if (!row) return false;
  if (row.lastStatus !== "SUBSCRIBED" || row.subscribedAt == null) return false;
  const now = Date.now();
  const silentAfterMs = Math.max(1_000, Math.floor(opts?.silentAfterMs ?? row.silentAfterMs ?? DEFAULT_SILENT_AFTER_MS));
  const lastHealthyAt = row.lastSignalAt ?? row.lastHealthyAt ?? row.subscribedAt;
  const silentForMs = Math.max(0, now - lastHealthyAt);
  if (silentForMs <= silentAfterMs) return true;
  if ((row.lastSilentAlertAt ?? 0) + SILENT_ALERT_MIN_GAP_MS <= now) {
    row.lastSilentAlertAt = now;
    messengerMonitorRealtimeSilentScope(scope, silentForMs, {
      lastStatus: row.lastStatus ?? "unknown",
      failureStatus: row.lastFailureStatus ?? "none",
    });
  }
  return false;
}
