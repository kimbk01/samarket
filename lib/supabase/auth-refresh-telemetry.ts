/**
 * 브라우저 `auth.refreshSession()` 단일 비행 + 관측 로그.
 * Supabase refresh token rotation 은 **동일 토큰으로 동시 refresh 시** `Already Used` 가 난다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isGuestAuthEstablished, logGuestFetchSkipped } from "@/lib/auth/guest-auth-state";

type RefreshResult = Awaited<ReturnType<SupabaseClient["auth"]["refreshSession"]>>;

let refreshInflight: Promise<RefreshResult> | null = null;
let refreshInflightCount = 0;
let refreshInflightPeak = 0;
/** `runBrowserAuthRefreshDeduped` 완료 시각 — CM realtime 루프 진단용(관측만) */
let lastAuthRefreshEndedAt: number | null = null;
/** `logAuthSessionChanged` 마지막 호출 시각 */
let lastAuthSessionSignalAt: number | null = null;

export function getAuthRefreshLastEndedAgeMs(now = Date.now()): number | null {
  if (lastAuthRefreshEndedAt == null) return null;
  return now - lastAuthRefreshEndedAt;
}

export function getAuthSessionSignalAgeMs(now = Date.now()): number | null {
  if (lastAuthSessionSignalAt == null) return null;
  return now - lastAuthSessionSignalAt;
}

function tail6(value: string | null | undefined): string | null {
  const s = String(value ?? "").trim();
  if (s.length < 6) return s.length ? s : null;
  return s.slice(-6);
}

function logJson(tag: string, payload: Record<string, unknown>): void {
  if (typeof console === "undefined" || typeof console.info !== "function") return;
  console.info(tag, JSON.stringify(payload));
}

/** 단일 브라우저 클라이언트 생성 시 1회 */
export function logAuthClientCreated(): void {
  logJson("[auth_client_created]", { at: Date.now() });
}

export function logAuthSessionChanged(event: string): void {
  lastAuthSessionSignalAt = Date.now();
  logJson("[auth_session_changed]", { event, at: Date.now() });
}

export function getAuthRefreshInflightCount(): number {
  return refreshInflightCount;
}

export function getAuthRefreshInflightPeak(): number {
  return refreshInflightPeak;
}

/**
 * `sb.auth.refreshSession()` — 동시 호출은 **같은 Promise**에 합류.
 * (auto-refresh 와의 완전 직렬화는 SDK 내부 한계가 있으나, 수동 `refreshSession` 경합은 제거)
 */
export async function runBrowserAuthRefreshDeduped(sb: SupabaseClient, source: string): Promise<RefreshResult> {
  if (isGuestAuthEstablished()) {
    logGuestFetchSkipped("auth_refresh", source);
    return { data: { session: null, user: null }, error: null };
  }
  if (refreshInflight) {
    logJson("[auth_refresh_start]", {
      source,
      auth_refresh_inflight_count: refreshInflightCount,
      joined_inflight: true,
      auth_refresh_inflight_peak: refreshInflightPeak,
    });
    return refreshInflight;
  }

  refreshInflightCount += 1;
  if (refreshInflightCount > refreshInflightPeak) refreshInflightPeak = refreshInflightCount;

  logJson("[auth_refresh_start]", {
    source,
    auth_refresh_inflight_count: refreshInflightCount,
    joined_inflight: false,
    auth_refresh_inflight_peak: refreshInflightPeak,
  });

  const p = sb.auth
    .refreshSession()
    .then((out) => {
      const err = out.error as { message?: string; code?: string } | null | undefined;
      const sess = out.data?.session as { refresh_token?: string } | null | undefined;
      if (err) {
        logJson("[auth_refresh_fail]", {
          source,
          message: String(err.message ?? ""),
          code: String(err.code ?? ""),
          auth_refresh_token_hash: tail6(sess?.refresh_token),
          auth_refresh_inflight_count: refreshInflightCount,
          auth_refresh_inflight_peak: refreshInflightPeak,
        });
      } else {
        logJson("[auth_refresh_success]", {
          source,
          auth_refresh_token_hash: tail6(sess?.refresh_token),
          auth_refresh_inflight_count: refreshInflightCount,
          auth_refresh_inflight_peak: refreshInflightPeak,
        });
      }
      return out;
    })
    .finally(() => {
      lastAuthRefreshEndedAt = Date.now();
      refreshInflightCount -= 1;
      refreshInflight = null;
    });

  refreshInflight = p;
  return p;
}

/** vitest reset */
export function resetAuthRefreshTelemetryForTests(): void {
  refreshInflight = null;
  refreshInflightCount = 0;
  refreshInflightPeak = 0;
  lastAuthRefreshEndedAt = null;
  lastAuthSessionSignalAt = null;
}
