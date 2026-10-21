import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isApplePrivateRelayEmail,
  normalizeProviderEmail,
  readProviderEmailVerifiedSignal,
} from "@/lib/auth/provider-identity/email-policy";
import { createConflictStashToken } from "@/lib/auth/provider-identity/link-token.server";
import { findIdentitiesByUserId } from "@/lib/auth/provider-identity/repository.server";
import { ensureProviderAuthIdentityRow } from "@/lib/auth/provider-identity/native-session-bridge.server";
import {
  authUserHasProductProfile,
  PROVIDER_ACCOUNT_RECONCILIATION_REQUIRED,
  PROVIDER_ACCOUNT_RECONCILIATION_REQUIRED_MESSAGE,
} from "@/lib/auth/provider-identity/oauth-rebind-safety.server";
import {
  PROVIDER_ACCOUNT_LINK_REQUIRED,
  PROVIDER_ACCOUNT_LINK_REQUIRED_MESSAGE,
} from "@/lib/auth/provider-identity/password-member-lookup.server";
import { resolveProviderLogin } from "@/lib/auth/provider-identity/resolve-provider-login.server";
import type { LinkableAuthProvider, ProviderIdentityCandidate } from "@/lib/auth/provider-identity/types";
import { isLinkableAuthProvider } from "@/lib/auth/provider-identity/provider-display";
import {
  hashPrefixForAuthDiag,
  logWebOAuthProviderPolicyDiag,
  newWebOAuthCallbackAttemptId,
  type WebOAuthPolicyDiag,
} from "@/lib/auth/provider-identity/web-oauth-policy-diagnostics.server";

export {
  PROVIDER_ACCOUNT_RECONCILIATION_REQUIRED,
  PROVIDER_ACCOUNT_RECONCILIATION_REQUIRED_MESSAGE,
} from "@/lib/auth/provider-identity/oauth-rebind-safety.server";

export {
  PROVIDER_ACCOUNT_LINK_REQUIRED,
  PROVIDER_ACCOUNT_LINK_REQUIRED_MESSAGE,
} from "@/lib/auth/provider-identity/password-member-lookup.server";

function pickStr(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function identityProvider(row: unknown): string {
  return String((row as { provider?: string }).provider ?? "").trim().toLowerCase();
}

function identityLastSignInMs(row: unknown): number {
  const raw = (row as { last_sign_in_at?: string | null }).last_sign_in_at;
  const ms = typeof raw === "string" && raw.trim() ? Date.parse(raw) : Number.NaN;
  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
}

/**
 * P1-6 — 이번 로그인에 쓰인 identity 선택.
 * 1) start route 가 callback `?provider=` 로 넘긴 provider 와 일치하는 identity
 * 2) 없으면 `last_sign_in_at` 최신 linkable identity (동률·누락 시 기존 순서 = 첫 번째)
 */
function pickThisLoginOAuthIdentity(
  identities: unknown[],
  loginProvider: string | null | undefined,
): unknown | null {
  const linkable = identities.filter((row) => isLinkableAuthProvider(identityProvider(row)));
  if (linkable.length === 0) return null;
  const wanted = String(loginProvider ?? "").trim().toLowerCase();
  if (wanted && isLinkableAuthProvider(wanted)) {
    const match = linkable.find((row) => identityProvider(row) === wanted);
    if (match) return match;
  }
  let best = linkable[0];
  let bestMs = identityLastSignInMs(best);
  for (const row of linkable.slice(1)) {
    const ms = identityLastSignInMs(row);
    if (ms > bestMs) {
      best = row;
      bestMs = ms;
    }
  }
  return best;
}

/** Supabase OAuth User → provider identity candidate (google/kakao/apple) — 이번 로그인 identity 기준. */
export function buildOAuthUserProviderCandidate(
  user: User,
  options?: { loginProvider?: string | null },
): ProviderIdentityCandidate | null {
  const identities = Array.isArray(user.identities) ? user.identities : [];
  const oauthIdentity = pickThisLoginOAuthIdentity(identities, options?.loginProvider);
  if (!oauthIdentity) return null;

  const provider = String((oauthIdentity as { provider?: string }).provider ?? "")
    .trim()
    .toLowerCase() as LinkableAuthProvider;
  const identityData =
    ((oauthIdentity as { identity_data?: Record<string, unknown> }).identity_data ?? {}) as Record<
      string,
      unknown
    >;

  const providerUserId =
    pickStr(identityData.sub)
    ?? pickStr(identityData.id)
    ?? pickStr((oauthIdentity as { id?: string }).id)
    ?? "";

  if (!providerUserId) return null;

  const emailFromIdentity = normalizeProviderEmail(
    typeof identityData.email === "string" ? identityData.email : null,
  );
  const email = emailFromIdentity ?? normalizeProviderEmail(user.email);
  const relay = isApplePrivateRelayEmail(email);
  // Fail-safe: only identity_data.email_verified (or string "true") counts for Package D.
  const emailVerified = !relay && readProviderEmailVerifiedSignal(identityData.email_verified);

  return {
    provider,
    providerUserId,
    email: relay ? null : email,
    emailVerified,
    emailIsPrivateRelay: relay,
    rawProfile: {
      sub: providerUserId,
      email,
      email_verified: emailVerified,
      identity_provider: provider,
      source: "web_oauth_callback",
    },
  };
}

export type WebOAuthProviderPolicyResult =
  | {
      ok: true;
      candidate: ProviderIdentityCandidate | null;
      diag: WebOAuthPolicyDiag;
      /** Same provider subject already owned in user_auth_identities — rebind session to this user. */
      rebindToUserId?: string;
    }
  | {
      ok: false;
      errorCode:
        | "provider_email_conflict"
        | "provider_account_conflict"
        | typeof PROVIDER_ACCOUNT_RECONCILIATION_REQUIRED
        | typeof PROVIDER_ACCOUNT_LINK_REQUIRED
        | "account_suspended"
        | "account_blocked"
        | "account_withdrawn";
      message: string;
      diag: WebOAuthPolicyDiag;
      conflict?: {
        email: string;
        attemptedProvider: LinkableAuthProvider;
        existingProviders: string[];
        stashToken: string;
      };
    };

function baseDiag(input: {
  callbackAttemptId: string;
  provider: string | null;
  candidate: ProviderIdentityCandidate | null;
  sessionUserId: string;
}): WebOAuthPolicyDiag {
  return {
    callbackAttemptId: input.callbackAttemptId,
    provider: input.provider,
    policyResult: "allow",
    conflictReason: null,
    incomingProviderSubjectHashPrefix: hashPrefixForAuthDiag(input.candidate?.providerUserId),
    incomingEmailPresent: Boolean(input.candidate?.email?.trim()),
    incomingEmailVerified: Boolean(input.candidate?.emailVerified),
    existingAuthUserFound: false,
    existingProfileFound: false,
    existingProviderIdentityFound: false,
    sameProviderSubjectMatch: false,
    sameNormalizedEmailMatch: false,
    conflictingProviderTypes: [],
    pendingConflictRecordFound: false,
    orphanAuthUserDetected: false,
    orphanProfileDetected: false,
    autoLinkAllowed: false,
    rejectionBranch: null,
    sessionUserIdHashPrefix: hashPrefixForAuthDiag(input.sessionUserId),
    matchedUserIdHashPrefix: null,
    resolveStatus: null,
  };
}

/**
 * P1-6 — 이번 로그인 identity(candidate) 에 SSOT row 가 없는데(resolve = new),
 * 세션 auth user 가 다른 identity 를 이미 가진 기존 회원(profile 또는 SSOT row 보유)이면
 * Supabase 가 이메일로 자동 연결한 것으로 본다. 조회 실패는 fail-closed(연결로 간주).
 */
async function detectSupabaseAutoLinkedIdentity(
  sb: SupabaseClient,
  user: User,
  candidate: ProviderIdentityCandidate,
  sessionHasProfile: boolean,
): Promise<{ existingProviders: string[]; ssotProviders: string[] } | null> {
  const identities = Array.isArray(user.identities) ? user.identities : [];
  const otherIdentityProviders = identities
    .filter((row) => {
      const p = identityProvider(row);
      if (!p || p === candidate.provider) return false;
      return true;
    })
    .map((row) => identityProvider(row));
  if (otherIdentityProviders.length === 0) return null;

  let ssotProviders: string[] = [];
  let lookupFailed = false;
  try {
    const rows = await findIdentitiesByUserId(sb, user.id);
    ssotProviders = Array.from(
      new Set(
        rows
          .map((row) => String(row.provider ?? "").trim().toLowerCase())
          .filter((p) => p && p !== candidate.provider),
      ),
    );
  } catch {
    lookupFailed = true;
  }

  const isExistingMember = sessionHasProfile || ssotProviders.length > 0 || lookupFailed;
  if (!isExistingMember) return null;

  const existingProviders =
    ssotProviders.length > 0 ? ssotProviders : Array.from(new Set(otherIdentityProviders));
  return { existingProviders, ssotProviders };
}

/**
 * Web OAuth callback identity policy.
 * Does not auto-merge providers. Logs structured diagnostics without PII.
 */
export async function enforceWebOAuthProviderPolicy(
  sb: SupabaseClient,
  user: User,
  options?: { callbackAttemptId?: string; loginProvider?: string | null },
): Promise<WebOAuthProviderPolicyResult> {
  const callbackAttemptId = options?.callbackAttemptId ?? newWebOAuthCallbackAttemptId();
  const candidate = buildOAuthUserProviderCandidate(user, { loginProvider: options?.loginProvider });
  const diag = baseDiag({
    callbackAttemptId,
    provider: candidate?.provider ?? null,
    candidate,
    sessionUserId: user.id,
  });

  if (!candidate) {
    diag.resolveStatus = "no_candidate";
    logWebOAuthProviderPolicyDiag(diag);
    return { ok: true, candidate: null, diag };
  }

  const sessionHasProfile = await authUserHasProductProfile(sb, user.id);
  diag.orphanAuthUserDetected = !sessionHasProfile;

  const resolved = await resolveProviderLogin(sb, candidate);
  diag.resolveStatus = resolved.status;

  if (resolved.status === "new") {
    // P1-6 — Supabase 이메일 자동 identity 연결: 이번 identity 는 SSOT row 가 없는데
    // 세션 user 는 이미 다른 identity 를 가진 기존 DIBAY 회원 → 기존 계정 진입 금지(conflict UX).
    const autoLinked = await detectSupabaseAutoLinkedIdentity(sb, user, candidate, sessionHasProfile);
    if (autoLinked) {
      const conflictEmail =
        normalizeProviderEmail(candidate.email) ?? normalizeProviderEmail(user.email) ?? "";
      const stashToken = createConflictStashToken(candidate);
      diag.policyResult = "reject";
      diag.conflictReason = "SAME_EMAIL_DIFFERENT_PROVIDER";
      diag.rejectionBranch = "new.supabase_auto_linked_identity";
      diag.existingAuthUserFound = true;
      diag.existingProfileFound = sessionHasProfile;
      diag.existingProviderIdentityFound = autoLinked.ssotProviders.length > 0;
      diag.sameNormalizedEmailMatch = true;
      diag.sameProviderSubjectMatch = false;
      diag.conflictingProviderTypes = autoLinked.existingProviders;
      diag.matchedUserIdHashPrefix = hashPrefixForAuthDiag(user.id);
      diag.pendingConflictRecordFound = Boolean(stashToken);
      diag.autoLinkAllowed = false;
      logWebOAuthProviderPolicyDiag(diag);
      return {
        ok: false,
        errorCode: "provider_email_conflict",
        message: "보안을 위해 기존 로그인 확인이 필요합니다.",
        diag,
        conflict: {
          email: conflictEmail,
          attemptedProvider: candidate.provider,
          existingProviders: autoLinked.existingProviders,
          stashToken,
        },
      };
    }
    logWebOAuthProviderPolicyDiag(diag);
    return { ok: true, candidate, diag };
  }

  if (resolved.status === "email_conflict") {
    const stashToken = createConflictStashToken(candidate);
    diag.policyResult = "reject";
    diag.conflictReason = "SAME_EMAIL_DIFFERENT_PROVIDER";
    diag.rejectionBranch = "resolve.email_conflict";
    diag.existingAuthUserFound = true;
    diag.existingProviderIdentityFound = true;
    diag.sameNormalizedEmailMatch = true;
    diag.sameProviderSubjectMatch = false;
    diag.conflictingProviderTypes = resolved.conflict.existingProviders.map(String);
    diag.matchedUserIdHashPrefix = hashPrefixForAuthDiag(resolved.conflict.existingUserId);
    diag.pendingConflictRecordFound = Boolean(stashToken);
    diag.existingProfileFound = await authUserHasProductProfile(sb, resolved.conflict.existingUserId);
    logWebOAuthProviderPolicyDiag(diag);
    return {
      ok: false,
      errorCode: "provider_email_conflict",
      message: "보안을 위해 기존 로그인 확인이 필요합니다.",
      diag,
      conflict: {
        email: resolved.conflict.email,
        attemptedProvider: resolved.conflict.attemptedProvider,
        existingProviders: resolved.conflict.existingProviders,
        stashToken,
      },
    };
  }

  if (resolved.status === "account_link_required") {
    diag.policyResult = "reject";
    diag.conflictReason = "VERIFIED_SOCIAL_EMAIL_MATCHES_PASSWORD_MEMBER";
    diag.rejectionBranch = "resolve.account_link_required";
    diag.existingAuthUserFound = true;
    diag.existingProviderIdentityFound = false;
    diag.sameNormalizedEmailMatch = true;
    diag.sameProviderSubjectMatch = false;
    diag.matchedUserIdHashPrefix = hashPrefixForAuthDiag(resolved.candidateUserId);
    diag.existingProfileFound = await authUserHasProductProfile(sb, resolved.candidateUserId);
    diag.autoLinkAllowed = false;
    logWebOAuthProviderPolicyDiag(diag);
    return {
      ok: false,
      errorCode: PROVIDER_ACCOUNT_LINK_REQUIRED,
      message: PROVIDER_ACCOUNT_LINK_REQUIRED_MESSAGE,
      diag,
    };
  }

  if (resolved.status === "lifecycle_denied") {
    diag.policyResult = "reject";
    diag.conflictReason = "PASSWORD_MEMBER_LIFECYCLE_DENY";
    diag.rejectionBranch = `resolve.lifecycle_denied.${resolved.errorCode}`;
    diag.existingAuthUserFound = true;
    diag.sameNormalizedEmailMatch = true;
    diag.autoLinkAllowed = false;
    logWebOAuthProviderPolicyDiag(diag);
    return {
      ok: false,
      errorCode: resolved.errorCode,
      message: resolved.message,
      diag,
    };
  }

  if (resolved.status === "provider_user_id_conflict") {
    diag.policyResult = "reject";
    diag.conflictReason = resolved.conflictReason;
    diag.rejectionBranch = "resolve.provider_user_id_conflict";
    logWebOAuthProviderPolicyDiag(diag);
    return {
      ok: false,
      errorCode: "provider_account_conflict",
      message: resolved.message,
      diag,
    };
  }

  // existing identity / profile owner
  diag.existingAuthUserFound = true;
  diag.existingProviderIdentityFound = resolved.via === "user_auth_identities";
  diag.sameProviderSubjectMatch = true;
  diag.matchedUserIdHashPrefix = hashPrefixForAuthDiag(resolved.userId);
  diag.existingProfileFound = await authUserHasProductProfile(sb, resolved.userId);
  diag.orphanProfileDetected = diag.existingProfileFound && !diag.existingProviderIdentityFound
    && resolved.via === "profiles_fallback";

  if (resolved.userId !== user.id) {
    // R7-3: established/session profile-bearing principals must never enter destructive rebind.
    if (resolved.via === "user_auth_identities" && sessionHasProfile) {
      diag.policyResult = "reject";
      diag.conflictReason = "ESTABLISHED_MEMBER_REBIND_FORBIDDEN";
      diag.rejectionBranch =
        "existing.user_auth_identities.user_id_mismatch.established_member_reconciliation";
      diag.autoLinkAllowed = false;
      logWebOAuthProviderPolicyDiag(diag);
      return {
        ok: false,
        errorCode: PROVIDER_ACCOUNT_RECONCILIATION_REQUIRED,
        message: PROVIDER_ACCOUNT_RECONCILIATION_REQUIRED_MESSAGE,
        diag,
      };
    }

    // CASE B — profile-less OAuth principal may rebind to SSOT owner (FALSE CONFLICT).
    if (resolved.via === "user_auth_identities") {
      diag.policyResult = "allow";
      diag.conflictReason = "SAME_PROVIDER_SUBJECT_DIFFERENT_USER";
      diag.rejectionBranch = "existing.user_auth_identities.user_id_mismatch.rebind";
      diag.autoLinkAllowed = false;
      logWebOAuthProviderPolicyDiag(diag);
      return {
        ok: true,
        candidate,
        diag,
        rebindToUserId: resolved.userId,
      };
    }

    diag.policyResult = "reject";
    diag.conflictReason = "EXISTING_PROVIDER_IDENTITY_ALREADY_LINKED";
    diag.rejectionBranch = "existing.profiles_fallback.user_id_mismatch";
    logWebOAuthProviderPolicyDiag(diag);
    return {
      ok: false,
      errorCode: "provider_account_conflict",
      message: "이 로그인 계정은 다른 DIBAY 회원에 연결되어 있습니다.",
      diag,
    };
  }

  logWebOAuthProviderPolicyDiag(diag);
  return { ok: true, candidate, diag };
}

/**
 * Slice 7-4 PLAN_I2 Auth Identity Row writer — delegates to ensureProviderAuthIdentityRow.
 * OA-17: 실패 시 1회 재시도, 그래도 실패하면 구조화 로그 `oauth_identity_persist_failed` 후 false.
 * 로그인 자체는 실패시키지 않는다 (장애 확산 방지).
 */
export async function persistOAuthProviderIdentity(
  sb: SupabaseClient,
  userId: string,
  candidate: ProviderIdentityCandidate,
  options?: { callbackAttemptId?: string },
): Promise<boolean> {
  if (!candidate.providerUserId.trim()) return true;
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await ensureProviderAuthIdentityRow(sb, userId, candidate);
      return true;
    } catch (error) {
      lastError = error;
    }
  }
  const message =
    lastError instanceof Error
      ? lastError.message
      : String((lastError as { message?: unknown } | null)?.message ?? "unknown");
  console.error(
    "[auth/web-oauth-identity]",
    JSON.stringify({
      event: "oauth_identity_persist_failed",
      callbackAttemptId: options?.callbackAttemptId ?? null,
      provider: candidate.provider,
      subjectHashPrefix: hashPrefixForAuthDiag(candidate.providerUserId),
      userIdHashPrefix: hashPrefixForAuthDiag(userId),
      attempts: 2,
      errorCode: String((lastError as { code?: unknown } | null)?.code ?? "") || null,
      error: message.slice(0, 160),
    }),
  );
  return false;
}
