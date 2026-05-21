/**
 * Auth/session hot path — dev breakdown ([auth-hot-path-breakdown]).
 * @see docs/trade-perf-hot-path-changelog.md
 */

import { peekAuthLightSessionSnapshot } from "@/lib/auth/auth-light-session-snapshot-cache";
import { peekAuthSessionValidatedOkMeta } from "@/lib/auth/auth-session-response-cache";
import { peekAuthSessionValidateCachedMeta } from "@/lib/auth/auth-session-validate-cache";
import { devPerfNow } from "@/lib/dev/dev-api-perf-log";

export type AuthHotPathSource = "ttl_cache" | "light_snapshot" | "singleflight";

export type AuthHotPathBreakdown = {
  auth_total_ms: number;
  auth_cache_lookup_ms: number;
  auth_cache_hit: 0 | 1;
  auth_singleflight_hit: 0 | 1;
  auth_registry_ms: number;
  auth_profile_sync_ms: number;
  auth_cookie_parse_ms: number;
  auth_supabase_ms: number;
  auth_user_fetch_ms: number;
  auth_validate_ms: number;
  auth_payload_ms: number;
  auth_same_session_hit: 0 | 1;
  auth_same_device_hit: 0 | 1;
  auth_ttl_remaining_ms: number;
  auth_db_round_trips: number;
  route?: string;
  phase?: string;
  auth_source?: AuthHotPathSource;
};

export function emptyAuthHotPathBreakdown(): AuthHotPathBreakdown {
  return {
    auth_total_ms: 0,
    auth_cache_lookup_ms: 0,
    auth_cache_hit: 0,
    auth_singleflight_hit: 0,
    auth_registry_ms: 0,
    auth_profile_sync_ms: 0,
    auth_cookie_parse_ms: 0,
    auth_supabase_ms: 0,
    auth_user_fetch_ms: 0,
    auth_validate_ms: 0,
    auth_payload_ms: 0,
    auth_same_session_hit: 0,
    auth_same_device_hit: 0,
    auth_ttl_remaining_ms: 0,
    auth_db_round_trips: 0,
  };
}

export function logAuthHotPathBreakdown(
  row: AuthHotPathBreakdown & { route?: string; phase?: string }
): void {
  if (process.env.NODE_ENV !== "development") return;
  // eslint-disable-next-line no-console -- auth hot path lock
  console.info("[auth-hot-path-breakdown]", JSON.stringify(row));
}

/**
 * dedupe/TTL hit — DB 0 warm 경로 관측 (보안 로직 불변).
 */
export function logAuthDedupeWarmBreakdown(opts: {
  userId: string;
  sessionFingerprint: string;
  source: AuthHotPathSource;
  route?: string;
  singleflightHit?: boolean;
  totalMs?: number;
}): void {
  if (process.env.NODE_ENV !== "development") return;

  const t0 = devPerfNow();
  const snap = peekAuthLightSessionSnapshot(opts.userId, opts.sessionFingerprint);
  const validateMeta = peekAuthSessionValidateCachedMeta(opts.userId, opts.sessionFingerprint);
  const responseMeta = peekAuthSessionValidatedOkMeta(opts.userId, opts.sessionFingerprint);
  const ttlRemainingMs = snap.hit
    ? Math.round(snap.ttlRemainingMs)
    : Math.max(validateMeta.ttlRemainingMs, responseMeta.ttlRemainingMs, 0);

  const row: AuthHotPathBreakdown = {
    ...emptyAuthHotPathBreakdown(),
    auth_cache_hit: 1,
    auth_db_round_trips: 0,
    auth_registry_ms: 0,
    auth_profile_sync_ms: 0,
    auth_same_session_hit: snap.hit ? 1 : 0,
    auth_same_device_hit: snap.hit ? 1 : 0,
    auth_ttl_remaining_ms: ttlRemainingMs,
    auth_singleflight_hit: opts.singleflightHit ? 1 : 0,
    auth_total_ms: Math.round(opts.totalMs ?? Math.max(0, devPerfNow() - t0)),
    auth_source: opts.source,
    route: opts.route ?? "auth-session-validate-dedupe",
    phase: "warm",
  };
  logAuthHotPathBreakdown(row);
}
