import type { SupabaseClient, User } from "@supabase/supabase-js";
import { ensureAuthProfileRow } from "@/lib/auth/member-access";

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
  return typeof (data as { id: unknown }).id === "string"
    ? (data as { id: string }).id
    : null;
}

async function findCandidateIdsByProviderPair(
  sb: SupabaseClient,
  provider: string | null,
  providerUserId: string | null
): Promise<string[]> {
  if (!provider || !providerUserId) return [];
  /**
   * `profiles.provider_user_id` 마이그레이션이 적용된 환경에서만 매칭된다.
   * 컬럼이 없거나 권한 부족이면 silent fail → 빈 배열 (호출 측에서 email 폴백).
   */
  const { data, error } = await sb
    .from("profiles")
    .select("id")
    .eq("provider", provider)
    .eq("provider_user_id", providerUserId)
    .limit(5);
  if (error || !Array.isArray(data)) return [];
  return data
    .map((row) => (typeof (row as { id?: unknown }).id === "string" ? (row as { id: string }).id : ""))
    .filter(Boolean);
}

async function findCandidateIdsByEmail(
  sb: SupabaseClient,
  email: string | null
): Promise<string[]> {
  const e = pickStr(email)?.toLowerCase();
  if (!e) return [];
  const { data, error } = await sb
    .from("profiles")
    .select("id")
    .ilike("email", e)
    .limit(5);
  if (error || !Array.isArray(data)) return [];
  return data
    .map((row) => (typeof (row as { id?: unknown }).id === "string" ? (row as { id: string }).id : ""))
    .filter(Boolean);
}

async function persistProviderIdentityIfMissing(
  sb: SupabaseClient,
  userId: string,
  identity: IdentityHit
): Promise<void> {
  if (!identity.provider || !identity.providerUserId) return;
  /**
   * `provider_user_id` 컬럼은 별도 마이그레이션에서 추가됐다. 컬럼이 없는 환경에서는
   * update 가 실패해도 호출 흐름을 막지 않는다(어떤 환경에서도 로그인은 성공해야 함).
   */
  const patch: Record<string, unknown> = {};
  patch.provider = identity.provider;
  patch.auth_provider = identity.provider;
  patch.provider_user_id = identity.providerUserId;
  await sb
    .from("profiles")
    .update(patch)
    .eq("id", userId)
    .then(() => undefined, () => undefined);
}

/**
 * SNS 로그인 콜백 직후 호출되는 회원 보장 진입점.
 * 내부적으로 기존 `ensureAuthProfileRow` 의 row 생성 로직을 그대로 재사용해
 * 어떤 경우에도 `profiles.id == auth.users.id` 만 한 행이 보장된다.
 */
export async function ensureUserProfile(
  sb: SupabaseClient,
  user: User
): Promise<EnsureUserProfileOutcome> {
  if (!user || typeof user.id !== "string" || !user.id) {
    return { profile: null, created: false, linked: false };
  }

  /** 1) auth.users.id 로 기존 profiles 조회 — 있으면 그대로 사용. (절대 새 행 생성 금지) */
  const existingId = await tryFindExistingProfileId(sb, user.id);
  const identity = readIdentityFromUser(user);

  let duplicateWarning = false;
  let duplicateCandidates: string[] = [];
  /** 2~3) provider+provider_user_id / email 검사 — 다른 id 의 행이 있으면 자동 연결 금지 → 경고. */
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
    const emailCandidates = await findCandidateIdsByEmail(sb, user.email ?? null);
    for (const cid of emailCandidates) {
      if (cid && cid !== user.id) {
        duplicateWarning = true;
        duplicateCandidates.push(cid);
      }
    }
  }
  duplicateCandidates = Array.from(new Set(duplicateCandidates));

  if (existingId) {
    /**
     * provider/provider_user_id 컬럼만 비어 있는 기존 회원에게 식별값을 채워두면
     * 다음 로그인부터는 별도 조회 없이 매칭되고 진단 SQL 도 정확히 동작한다.
     */
    await persistProviderIdentityIfMissing(sb, user.id, identity);
    /**
     * 기존 회원이라도 누락 컬럼(닉네임/email/avatar 등) 보강은 `ensureAuthProfileRow`
     * 가 안전하게 처리한다 (이미 검증된 update 경로).
     */
    try {
      await ensureAuthProfileRow(sb, user);
    } catch {
      /* enrichment 실패는 로그인 흐름을 막지 않는다 */
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
  try {
    await ensureAuthProfileRow(sb, user);
  } catch {
    /* DB 제약/트리거 실패 시도 보장하지 못함 — 호출 측에서 클라이언트 ensure 폴백 */
  }
  await persistProviderIdentityIfMissing(sb, user.id, identity);

  /** 생성 직후 검증 — 행이 정말 만들어졌는지 한번 더 확인 */
  const verifyId = await tryFindExistingProfileId(sb, user.id);
  return {
    profile: verifyId ? { id: verifyId } : null,
    created: !!verifyId,
    linked: false,
    duplicateWarning: duplicateWarning || undefined,
    duplicateCandidates: duplicateWarning ? duplicateCandidates : undefined,
  };
}
