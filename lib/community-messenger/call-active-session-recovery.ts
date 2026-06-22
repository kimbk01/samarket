"use client";

import {
  readCallEngineSessionItem,
  removeCallEngineSessionItem,
  writeCallEngineSessionItem,
} from "@/lib/community-messenger/call-engine";

/** 동일 브라우저 다중 탭에서 active 복구 라우팅 1회만 */
export const ACTIVE_CALL_RECOVERY_LOCK_KEY = "samarket:cm-active-call-recovery";
export const ACTIVE_CALL_RECOVERY_LOCK_TTL_MS = 120_000;
/** 다중 탭 동시 복구 라우팅만 억제 — 새로고침 재시도는 TTL 이후 허용 */
export const ACTIVE_CALL_RECOVERY_DEDUPE_MS = 5_000;
/** 종료 직후 `/sessions/active` 가 stale `active` 를 주어도 통화 화면으로 되돌리지 않음 */
export const TERMINAL_CALL_RECOVERY_SUPPRESS_KEY = "samarket:cm-terminal-call-recovery-suppress";
export const TERMINAL_CALL_RECOVERY_SUPPRESS_TTL_MS = 120_000;

export type ActiveCallRecoverySession = {
  id?: string | null;
  status?: string | null;
  sessionMode?: string | null;
  startedAt?: string | null;
  answeredAt?: string | null;
  updatedAt?: string | null;
  initiatorUserId?: string | null;
  recipientUserId?: string | null;
  peerUserId?: string | null;
};

const TERMINAL_RECOVERY_STATUSES = new Set([
  "ended",
  "rejected",
  "missed",
  "cancelled",
  "canceled",
]);

export function isTerminalCallRecoveryStatus(status: string | null | undefined): boolean {
  const st = status?.trim().toLowerCase() ?? "";
  return TERMINAL_RECOVERY_STATUSES.has(st);
}

/** 앱 부팅·새로고침 복구는 연결된 `active` 통화만 — `ringing` 은 수신 배너·발신 다이얼이 담당 */
const RECOVERABLE_CALL_STATUSES = new Set(["active"]);

/**
 * 복구 라우팅 대상 `active` 1:1 direct 세션 id. `ringing`·종료 상태는 null.
 */
export function resolveActiveCallRecoveryTarget(
  session: ActiveCallRecoverySession | null | undefined,
  pathname: string
): string | null {
  if (pathname.startsWith("/community-messenger/calls/")) return null;
  const sid = session?.id?.trim();
  if (!sid) return null;
  const status = session?.status?.trim().toLowerCase() ?? "";
  if (!RECOVERABLE_CALL_STATUSES.has(status)) return null;
  if (isTerminalCallRecoveryStatus(status)) return null;
  if (session?.sessionMode && session.sessionMode !== "direct") return null;
  return sid;
}

export function isRingingRecoveryBlocked(
  session: ActiveCallRecoverySession | null | undefined,
): boolean {
  return session?.status?.trim().toLowerCase() === "ringing";
}

export function isRecoverySessionStale(
  session: ActiveCallRecoverySession | null | undefined,
  _nowMs = Date.now(),
): boolean {
  if (!session) return true;
  const status = session.status?.trim().toLowerCase() ?? "";
  if (isRingingRecoveryBlocked(session)) return true;
  if (!RECOVERABLE_CALL_STATUSES.has(status)) return true;
  if (isTerminalCallRecoveryStatus(status)) return true;
  return false;
}

export function readActiveCallRecoveryLock(): { sessionId: string; at: number } | null {
  try {
    const raw = readCallEngineSessionItem(ACTIVE_CALL_RECOVERY_LOCK_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as { sessionId?: string; at?: number };
    if (!j.sessionId?.trim() || typeof j.at !== "number") return null;
    if (Date.now() - j.at > ACTIVE_CALL_RECOVERY_LOCK_TTL_MS) {
      removeCallEngineSessionItem(ACTIVE_CALL_RECOVERY_LOCK_KEY);
      return null;
    }
    return { sessionId: j.sessionId.trim(), at: j.at };
  } catch {
    return null;
  }
}

export function readTerminalCallRecoverySuppress(): { sessionId: string; until: number } | null {
  try {
    const raw = readCallEngineSessionItem(TERMINAL_CALL_RECOVERY_SUPPRESS_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as { sessionId?: string; until?: number };
    const sessionId = j.sessionId?.trim();
    if (!sessionId || typeof j.until !== "number") return null;
    if (Date.now() >= j.until) {
      removeCallEngineSessionItem(TERMINAL_CALL_RECOVERY_SUPPRESS_KEY);
      return null;
    }
    return { sessionId, until: j.until };
  } catch {
    return null;
  }
}

export function writeTerminalCallRecoverySuppress(sessionId: string, _reason?: string): void {
  const sid = sessionId.trim();
  if (!sid) return;
  try {
    writeCallEngineSessionItem(
      TERMINAL_CALL_RECOVERY_SUPPRESS_KEY,
      JSON.stringify({ sessionId: sid, until: Date.now() + TERMINAL_CALL_RECOVERY_SUPPRESS_TTL_MS })
    );
  } catch {
    /* ignore */
  }
}

export function shouldSkipActiveCallRecoveryRouting(sessionId: string): boolean {
  const sid = sessionId.trim();
  const suppress = readTerminalCallRecoverySuppress();
  if (suppress?.sessionId === sid) return true;
  const lock = readActiveCallRecoveryLock();
  if (!lock || lock.sessionId !== sid) return false;
  return Date.now() - lock.at < ACTIVE_CALL_RECOVERY_DEDUPE_MS;
}

export function writeActiveCallRecoveryLock(sessionId: string): void {
  try {
    writeCallEngineSessionItem(
      ACTIVE_CALL_RECOVERY_LOCK_KEY,
      JSON.stringify({ sessionId: sessionId.trim(), at: Date.now() })
    );
  } catch {
    /* ignore */
  }
}

export async function fetchActiveDirectCallSessionForRecovery(): Promise<ActiveCallRecoverySession | null> {
  const res = await fetch("/api/community-messenger/calls/sessions/active", {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    session?: ActiveCallRecoverySession | null;
  };
  if (!json.ok || !json.session) return null;
  return json.session;
}
