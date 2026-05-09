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
  /**
   * 「한 번도 payload 가 오지 않은 scope」는 silent 판정 대상에서 제외한다.
   *
   * 수신 통화(`community-messenger-incoming-call:*`)·친구 요청·알림 등
   * **사건 기반 sparse channel** 은 사용자 액션이 없는 한 평시에 영원히 0 payload 가 정상이다.
   * 첫 markSignal 이전까지는 SUBSCRIBED 만으로 health 를 판정해야,
   * `[messenger:perf] silent_channel` 오탐(헌장 [근본 대책만] §「임계값만 가리는 구성 금지」)을 막는다.
   *
   * 첫 payload 이후에는 `lastSignalAt` 이 채워지므로 정상 silence 감시(WS 연결돼있는데 payload 끊김)가 의미를 갖는다.
   */
  if (row.lastSignalAt == null) return true;
  const now = Date.now();
  const silentAfterMs = Math.max(1_000, Math.floor(opts?.silentAfterMs ?? row.silentAfterMs ?? DEFAULT_SILENT_AFTER_MS));
  const lastHealthyAt = row.lastSignalAt;
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
