import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  findActiveProfileIdsByEmail,
  findActiveProfileIdsByProviderPair,
} from "@/lib/auth/active-profile-lookup";
import type { ProfileRow } from "@/lib/profile/types";
import { ensureAuthProfileRow } from "@/lib/auth/member-access";
import { isDeletedStoreMember } from "@/lib/auth/store-member-policy";
import { devPerfNow } from "@/lib/dev/dev-api-perf-log";

/**
 * SNS 로그인 후 회원 식별·중복 방지 단일 진입점.
 *
 * 절대 규칙(엔진 스펙):
 * 1. 로그인 시 `profiles.insert` 무조건 실행 금지.
 * 2. 우선순위로 기존 회원을 찾고, **없을 때만 1회** 생성.
 * 3. `provider + provider_user_id` 가 있는데 다른 `auth.users.id` 와 매칭되면
 *    자동 병합/덮어쓰기 금지 — `duplicateWarning=true` 로 운영자에게 가시화.
 * 4. 어떤 경우에도 `auth.users.id == profiles.id` 매핑은 깨지지 않는다.
 *
 * 식별 우선순위:
 *   1) `auth.users.id` (=== `profiles.id`)
 *   2) `auth.identities` 의 `(provider, provider_id|sub)` (=== `profiles.provider + profiles.provider_user_id`)
 *   3) `email`
 *   4) `phone`
 */
export interface EnsureUserProfileOutcome {
  profile: { id: string } | null;
  /** 신규 행을 생성한 경우 true */
  created: boolean;
  /** 기존 행이 있어 그대로 사용한 경우 true (id 매칭) */
  linked: boolean;
  /**
   * 다른 식별값(`provider+provider_user_id` 또는 email)에 매칭되는
   * 별도 `profiles` 행이 발견됐다는 신호. 자동 병합 금지 → 운영자 검토.
   */
  duplicateWarning?: boolean;
  /** 충돌 후보 profile id 목록 (운영자 진단용) */
  duplicateCandidates?: string[];
}

export type EnsureUserProfileResultKind =
  | "existing_found"
  | "created"
  | "updated"
  | "skipped"
  | "failed"
  | "";

/** `[dev-api-perf]` — `ensureUserProfile` 내부 분해 (GET /api/me/profile 합산용) */
export type EnsureUserProfileMetrics = {
  ensure_profile_total_ms: number;
  ensure_profile_existing_check_ms: number;
  ensure_profile_auth_row_check_ms: number;
  ensure_profile_insert_ms: number;
  ensure_profile_upsert_ms: number;
  ensure_profile_update_ms: number;
  ensure_profile_rpc_ms: number;
  ensure_profile_policy_or_rls_wait_ms: number;
  ensure_profile_result: EnsureUserProfileResultKind;
  ensure_profile_attempt_count: number;
  ensure_profile_write_executed: 0 | 1;
  ensure_profile_read_executed: 0 | 1;
  /** `[dev-api-perf]` — provider PATCH 가 생략·실행될 때만 채움 */
  ensure_profile_patch_keys?: string;
  ensure_profile_patch_count?: number;
  ensure_profile_provider_persist_reason?: string;
  ensure_profile_normalize_mismatch?: 0 | 1;
  ensure_profile_skipped_fields?: string;
  /** `persistProviderIdentityIfMissing` — DB/다음 패치 비교(진단·noop 판별) */
  ensure_profile_provider_existing_provider?: string;
  ensure_profile_provider_existing_auth_provider?: string;
  ensure_profile_provider_existing_provider_user_id?: string;
  ensure_profile_provider_next_provider?: string;
  ensure_profile_provider_next_auth_provider?: string;
  ensure_profile_provider_next_provider_user_id?: string;
  ensure_profile_provider_noop_skip?: 0 | 1;
  /** noop skip 시 0, 실제 PATCH 직전 컬럼 수 */
  ensure_profile_patch_count_after?: number;
};

export function createEnsureUserProfileMetrics(): EnsureUserProfileMetrics {
  return {
    ensure_profile_total_ms: 0,
    ensure_profile_existing_check_ms: 0,
    ensure_profile_auth_row_check_ms: 0,
    ensure_profile_insert_ms: 0,
    ensure_profile_upsert_ms: 0,
    ensure_profile_update_ms: 0,
    ensure_profile_rpc_ms: 0,
    ensure_profile_policy_or_rls_wait_ms: 0,
    ensure_profile_result: "",
    ensure_profile_attempt_count: 0,
    ensure_profile_write_executed: 0,
    ensure_profile_read_executed: 0,
  };
}

export type EnsureUserProfileOptions = {
  metrics?: EnsureUserProfileMetrics;
  /**
   * 이미 읽은 `profiles` 행(예: `fetchProfileRowSafe` 직후) — id 일치·정상 행이면
   * `ensureAuthProfileRow` 등 heavy 경로를 생략한다.
   */
  existingProfileRow?: ProfileRow | null;
};

type IdentityHit = {
  provider: string | null;
  providerUserId: string | null;
};

const SUPPORTED_PROVIDERS = new Set([
  "google",
  "kakao",
  "naver",
  "apple",
  "facebook",
  "email",
  "manual",
]);

function pickStr(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readProviderUserIdFromRow(row: ProfileRow): string | null {
  const raw = (row as ProfileRow & { provider_user_id?: unknown }).provider_user_id;
  return pickStr(raw);
}

/**
 * GET /api/me/profile 등 — 이미 `profiles` 행이 있을 때 `ensureAuthProfileRow` 생략 가능 여부.
 * (신규·빈 행·삭제·정지는 heavy 경로로 보낸다.)
 */
export function meProfileEnsureFastPathEligible(row: ProfileRow, user: User): boolean {
  if (!row || row.id !== user.id) return false;
  if (pickStr(row.deleted_at)) return false;
  const ms = (row.member_status ?? "").trim().toLowerCase();
  if (!ms || ms === "deleted" || ms === "suspended") return false;
  const st = (row.status ?? "").trim().toLowerCase();
  if (st === "blocked" || st === "deleted") return false;
  if (!pickStr(row.nickname)) return false;
  if (!pickStr(row.email) && !pickStr(user.email)) return false;
  return true;
}

function readIdentityFromUser(user: User): IdentityHit {
  const identities = Array.isArray(user.identities) ? user.identities : [];
  for (const identity of identities) {
    const rawProvider = (identity as { provider?: unknown }).provider;
    const providerId = (identity as { provider_id?: unknown }).provider_id;
    const data = (identity as { identity_data?: Record<string, unknown> | null }).identity_data;
    const provider = pickStr(rawProvider)?.toLowerCase() ?? null;
    if (!provider) continue;
    if (!SUPPORTED_PROVIDERS.has(provider)) continue;
    const subFromData =
      data && typeof data === "object"
        ? pickStr((data as Record<string, unknown>).sub) ??
          pickStr((data as Record<string, unknown>).provider_id) ??
          pickStr((data as Record<string, unknown>).id)
        : null;
    const providerUserId = pickStr(providerId) ?? subFromData;
    if (providerUserId) return { provider, providerUserId };
  }
  const fallbackProvider =
    pickStr(user.app_metadata?.provider)?.toLowerCase() ??
    pickStr((user.user_metadata as Record<string, unknown> | null | undefined)?.provider)?.toLowerCase() ??
    null;
  return { provider: fallbackProvider, providerUserId: null };
}

async function tryFindExistingProfileId(
  sb: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data, error } = await sb
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return typeof (data as { id: unknown }).id === "string" ? (data as { id: string }).id : null;
}

async function findCandidateIdsByProviderPair(
  sb: SupabaseClient,
  provider: string | null,
  providerUserId: string | null
): Promise<string[]> {
  return findActiveProfileIdsByProviderPair(sb, provider, providerUserId);
}

async function findCandidateIdsByEmail(
  sb: SupabaseClient,
  email: string | null
): Promise<string[]> {
  return findActiveProfileIdsByEmail(sb, email);
}

/** provider·provider_user_id·auth_provider 가 이미 auth identity 와 동일하면 PATCH 불필요 */
function providerIdentityFullyMatchesRow(row: ProfileRow, identity: IdentityHit): boolean {
  if (!identity.provider || !identity.providerUserId) return true;
  const idProv = identity.provider.toLowerCase();
  const rowProv = pickStr(row.provider)?.toLowerCase() ?? "";
  const rowAuth = pickStr((row as ProfileRow & { auth_provider?: unknown }).auth_provider)?.toLowerCase() ?? "";
  const rowUid = readProviderUserIdFromRow(row);
  if (rowUid !== identity.providerUserId) return false;
  if (rowProv !== idProv) return false;
  if (!rowAuth) return false;
  if (rowAuth !== idProv) return false;
  return true;
}

async function persistProviderIdentityIfMissing(
  sb: SupabaseClient,
  userId: string,
  identity: IdentityHit,
  opts?: { existingProfileRow?: ProfileRow | null; metrics?: EnsureUserProfileMetrics }
): Promise<void> {
  if (!identity.provider || !identity.providerUserId) return;
  const row = opts?.existingProfileRow;
  const metrics = opts?.metrics;
  const np = identity.provider.toLowerCase();
  const nuid = identity.providerUserId;
  if (metrics) {
    metrics.ensure_profile_provider_next_provider = np;
    metrics.ensure_profile_provider_next_auth_provider = np;
    metrics.ensure_profile_provider_next_provider_user_id = nuid;
  }
  if (row && metrics) {
    const exP = pickStr(row.provider)?.toLowerCase() ?? "";
    const exA = pickStr((row as ProfileRow & { auth_provider?: unknown }).auth_provider)?.toLowerCase() ?? "";
    const exU = readProviderUserIdFromRow(row) ?? "";
    metrics.ensure_profile_provider_existing_provider = exP || "(empty)";
    metrics.ensure_profile_provider_existing_auth_provider = exA || "(empty)";
    metrics.ensure_profile_provider_existing_provider_user_id = exU || "(empty)";
    if (exP === np && exU === nuid && exA === np) {
      metrics.ensure_profile_provider_persist_reason = "identity_already_matches";
      metrics.ensure_profile_patch_keys = "none";
      metrics.ensure_profile_patch_count = 0;
      metrics.ensure_profile_patch_count_after = 0;
      metrics.ensure_profile_provider_noop_skip = 1;
      metrics.ensure_profile_skipped_fields = "provider,auth_provider,provider_user_id";
      return;
    }
  }
  if (row && providerIdentityFullyMatchesRow(row, identity)) {
    if (metrics) {
      metrics.ensure_profile_provider_persist_reason = "identity_already_matches";
      metrics.ensure_profile_patch_keys = "none";
      metrics.ensure_profile_patch_count = 0;
      metrics.ensure_profile_patch_count_after = 0;
      metrics.ensure_profile_provider_noop_skip = 1;
      metrics.ensure_profile_skipped_fields = "provider,auth_provider,provider_user_id";
    }
    return;
  }
  if (row && metrics) {
    const rp = pickStr(row.provider)?.toLowerCase() ?? "";
    if (rp && rp !== identity.provider.toLowerCase()) {
      metrics.ensure_profile_normalize_mismatch = 1;
    } else {
      metrics.ensure_profile_normalize_mismatch = 0;
    }
    metrics.ensure_profile_provider_persist_reason = "fill_missing_or_partial_identity";
    metrics.ensure_profile_provider_noop_skip = 0;
  }
  /**
   * `provider_user_id` 컬럼은 별도 마이그레이션에서 추가됐다. 컬럼이 없는 환경에서는
   * update 가 실패해도 호출 흐름을 막지 않는다(어떤 환경에서도 로그인은 성공해야 함).
   */
  const patch: Record<string, unknown> = {};
  patch.provider = identity.provider;
  patch.auth_provider = identity.provider;
  patch.provider_user_id = identity.providerUserId;
  if (metrics) {
    metrics.ensure_profile_patch_keys = Object.keys(patch).join(",");
    metrics.ensure_profile_patch_count = Object.keys(patch).length;
    metrics.ensure_profile_patch_count_after = Object.keys(patch).length;
  }
  await sb
    .from("profiles")
    .update(patch)
    .eq("id", userId)
    .then(() => undefined, () => undefined);
}

/** GET /api/me/profile — 동일 userId·identity 에서 duplicate 탐지 DB 왕복 재실행 억제 */
const AUTH_ROW_CHECK_CACHE_TTL_MS = 60_000;
const authRowCheckCache = new Map<
  string,
  { expiresAt: number; duplicateWarning: boolean; duplicateCandidates: string[] }
>();

function authRowCheckCacheKey(user: User, identity: IdentityHit): string {
  const email = pickStr(user.email)?.toLowerCase() ?? "";
  return `${user.id}\0${identity.provider ?? ""}\0${identity.providerUserId ?? ""}\0${email}`;
}

function peekAuthRowCheckCache(
  user: User,
  identity: IdentityHit
): { duplicateWarning: boolean; duplicateCandidates: string[] } | null {
  const row = authRowCheckCache.get(authRowCheckCacheKey(user, identity));
  if (!row || row.expiresAt <= Date.now()) {
    if (row) authRowCheckCache.delete(authRowCheckCacheKey(user, identity));
    return null;
  }
  return {
    duplicateWarning: row.duplicateWarning,
    duplicateCandidates: row.duplicateCandidates,
  };
}

function setAuthRowCheckCache(
  user: User,
  identity: IdentityHit,
  duplicateWarning: boolean,
  duplicateCandidates: string[]
): void {
  authRowCheckCache.set(authRowCheckCacheKey(user, identity), {
    expiresAt: Date.now() + AUTH_ROW_CHECK_CACHE_TTL_MS,
    duplicateWarning,
    duplicateCandidates,
  });
}

function bumpAttempt(metrics: EnsureUserProfileMetrics | undefined) {
  if (!metrics) return;
  metrics.ensure_profile_attempt_count += 1;
}

function markRead(metrics: EnsureUserProfileMetrics | undefined) {
  if (!metrics) return;
  metrics.ensure_profile_read_executed = 1;
}

function markWrite(metrics: EnsureUserProfileMetrics | undefined) {
  if (!metrics) return;
  metrics.ensure_profile_write_executed = 1;
}

/**
 * SNS 로그인 콜백 직후 호출되는 회원 보장 진입점.
 * 내부적으로 기존 `ensureAuthProfileRow` 의 row 생성 로직을 그대로 재사용해
 * 어떤 경우에도 `profiles.id == auth.users.id` 만 한 행이 보장된다.
 */
export async function ensureUserProfile(
  sb: SupabaseClient,
  user: User,
  options?: EnsureUserProfileOptions
): Promise<EnsureUserProfileOutcome> {
  const metrics = options?.metrics;
  const tAll0 = devPerfNow();
  try {
    if (!user || typeof user.id !== "string" || !user.id) {
      if (metrics) metrics.ensure_profile_result = "skipped";
      return { profile: null, created: false, linked: false };
    }
    return await ensureUserProfileCore(sb, user, options, metrics);
  } finally {
    if (metrics) metrics.ensure_profile_total_ms = Math.round(devPerfNow() - tAll0);
  }
}

async function ensureUserProfileCore(
  sb: SupabaseClient,
  user: User,
  options: EnsureUserProfileOptions | undefined,
  metrics: EnsureUserProfileMetrics | undefined
): Promise<EnsureUserProfileOutcome> {
  const identity = readIdentityFromUser(user);

  /** 1) auth.users.id 로 기존 profiles 조회 — 있으면 그대로 사용. (절대 새 행 생성 금지) */
  const tExisting0 = devPerfNow();
  let existingId: string | null = null;
  if (options?.existingProfileRow && options.existingProfileRow.id === user.id) {
    existingId = user.id;
  } else {
    bumpAttempt(metrics);
    markRead(metrics);
    existingId = await tryFindExistingProfileId(sb, user.id);
  }
  if (metrics) {
    metrics.ensure_profile_existing_check_ms += Math.round(devPerfNow() - tExisting0);
  }

  if (existingId) {
    const withdrawnCheckRow: ProfileRow | null =
      options?.existingProfileRow?.id === user.id
        ? options.existingProfileRow
        : null;
    if (withdrawnCheckRow && isDeletedStoreMember(withdrawnCheckRow)) {
      if (metrics) {
        metrics.ensure_profile_result = "skipped";
      }
      return { profile: { id: user.id }, created: false, linked: false };
    }
    if (!withdrawnCheckRow) {
      const { data: statusRow } = await sb
        .from("profiles")
        .select("id, status, deleted_at")
        .eq("id", user.id)
        .maybeSingle();
      if (isDeletedStoreMember(statusRow as ProfileRow | null)) {
        if (metrics) {
          metrics.ensure_profile_result = "skipped";
        }
        return { profile: { id: user.id }, created: false, linked: false };
      }
    }
  }

  /** GET /api/me/profile: 이미 정상 행을 읽었으면 duplicate·heavy ensure 생략 */
  if (
    existingId &&
    options?.existingProfileRow &&
    options.existingProfileRow.id === user.id &&
    meProfileEnsureFastPathEligible(options.existingProfileRow, user)
  ) {
    if (metrics) {
      metrics.ensure_profile_auth_row_check_ms = 0;
    }
    const row = options.existingProfileRow;
    const needsProviderPersist =
      Boolean(identity.provider && identity.providerUserId) && !providerIdentityFullyMatchesRow(row, identity);
    if (needsProviderPersist) {
      const tu0 = devPerfNow();
      bumpAttempt(metrics);
      await persistProviderIdentityIfMissing(sb, user.id, identity, { existingProfileRow: row, metrics });
      if (metrics) {
        metrics.ensure_profile_update_ms += Math.round(devPerfNow() - tu0);
        if (metrics.ensure_profile_patch_count && metrics.ensure_profile_patch_count > 0) {
          markWrite(metrics);
        }
      }
    } else if (metrics && identity.provider && identity.providerUserId) {
      metrics.ensure_profile_provider_persist_reason = "identity_already_matches";
      metrics.ensure_profile_patch_keys = "none";
      metrics.ensure_profile_patch_count = 0;
    }
    if (metrics) {
      metrics.ensure_profile_result = metrics.ensure_profile_write_executed ? "updated" : "skipped";
    }
    return {
      profile: { id: user.id },
      created: false,
      linked: true,
    };
  }

  let duplicateWarning = false;
  let duplicateCandidates: string[] = [];
  /** 2~3) provider+provider_user_id / email 검사 — 다른 id 의 행이 있으면 자동 연결 금지 → 경고. */
  const tAuth0 = devPerfNow();
  const cachedDup = peekAuthRowCheckCache(user, identity);
  if (cachedDup) {
    duplicateWarning = cachedDup.duplicateWarning;
    duplicateCandidates = cachedDup.duplicateCandidates;
  } else {
    bumpAttempt(metrics);
    markRead(metrics);
    const providerCandidates = await findCandidateIdsByProviderPair(
      sb,
      identity.provider,
      identity.providerUserId
    );
    for (const cid of providerCandidates) {
      if (cid && cid !== user.id) {
        duplicateWarning = true;
        duplicateCandidates.push(cid);
      }
    }
    if (!existingId && pickStr(user.email)) {
      bumpAttempt(metrics);
      markRead(metrics);
      const emailCandidates = await findCandidateIdsByEmail(sb, user.email ?? null);
      for (const cid of emailCandidates) {
        if (cid && cid !== user.id) {
          duplicateWarning = true;
          duplicateCandidates.push(cid);
        }
      }
    }
    duplicateCandidates = Array.from(new Set(duplicateCandidates));
    setAuthRowCheckCache(user, identity, duplicateWarning, duplicateCandidates);
  }
  if (metrics) {
    metrics.ensure_profile_auth_row_check_ms += Math.round(devPerfNow() - tAuth0);
  }

  if (existingId) {
    /**
     * provider/provider_user_id 컬럼만 비어 있는 기존 회원에게 식별값을 채워두면
     * 다음 로그인부터는 별도 조회 없이 매칭되고 진단 SQL 도 정확히 동작한다.
     */
    if (identity.provider && identity.providerUserId) {
      const tp0 = devPerfNow();
      bumpAttempt(metrics);
      await persistProviderIdentityIfMissing(sb, user.id, identity, { metrics });
      if (metrics) {
        metrics.ensure_profile_update_ms += Math.round(devPerfNow() - tp0);
        if (metrics.ensure_profile_patch_count && metrics.ensure_profile_patch_count > 0) {
          markWrite(metrics);
        }
      }
    }
    /**
     * 기존 회원이라도 누락 컬럼(닉네임/email/avatar 등) 보강은 `ensureAuthProfileRow`
     * 가 안전하게 처리한다 (이미 검증된 update 경로).
     */
    const tEn0 = devPerfNow();
    bumpAttempt(metrics);
    markRead(metrics);
    try {
      await ensureAuthProfileRow(sb, user);
      if (metrics) {
        metrics.ensure_profile_update_ms += Math.round(devPerfNow() - tEn0);
      }
    } catch {
      if (metrics) {
        metrics.ensure_profile_update_ms += Math.round(devPerfNow() - tEn0);
      }
      /* enrichment 실패는 로그인 흐름을 막지 않는다 */
    }
    if (metrics) {
      metrics.ensure_profile_result = "existing_found";
    }
    return {
      profile: { id: user.id },
      created: false,
      linked: true,
      duplicateWarning: duplicateWarning || undefined,
      duplicateCandidates: duplicateWarning ? duplicateCandidates : undefined,
    };
  }

  /**
   * 4) 기존 행이 없을 때만 **1회** 생성.
   * `ensureAuthProfileRow` 는 select-then-upsert(`onConflict: id`) 구조라
   * 동일 호출이 동시에 들어와도 `profiles.id` 단일 행만 보장된다.
   */
  const tCreate0 = devPerfNow();
  bumpAttempt(metrics);
  markRead(metrics);
  try {
    await ensureAuthProfileRow(sb, user);
    if (metrics) {
      metrics.ensure_profile_upsert_ms += Math.round(devPerfNow() - tCreate0);
      markWrite(metrics);
    }
  } catch {
    if (metrics) {
      metrics.ensure_profile_upsert_ms += Math.round(devPerfNow() - tCreate0);
    }
    /* DB 제약/트리거 실패 시도 보장하지 못함 — 호출 측에서 클라이언트 ensure 폴백 */
  }
  if (identity.provider && identity.providerUserId) {
    const tp2 = devPerfNow();
    bumpAttempt(metrics);
    await persistProviderIdentityIfMissing(sb, user.id, identity, { metrics });
    if (metrics) {
      metrics.ensure_profile_update_ms += Math.round(devPerfNow() - tp2);
      if (metrics.ensure_profile_patch_count && metrics.ensure_profile_patch_count > 0) {
        markWrite(metrics);
      }
    }
  }

  /** 생성 직후 검증 — 행이 정말 만들어졌는지 한번 더 확인 */
  const tv0 = devPerfNow();
  bumpAttempt(metrics);
  markRead(metrics);
  const verifyId = await tryFindExistingProfileId(sb, user.id);
  if (metrics) {
    metrics.ensure_profile_insert_ms += Math.round(devPerfNow() - tv0);
    metrics.ensure_profile_result = verifyId ? "created" : "failed";
  }
  return {
    profile: verifyId ? { id: verifyId } : null,
    created: !!verifyId,
    linked: false,
    duplicateWarning: duplicateWarning || undefined,
    duplicateCandidates: duplicateWarning ? duplicateCandidates : undefined,
  };
}
