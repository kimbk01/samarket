import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ProviderIdentityCandidate,
  ResolveProviderLoginResult,
} from "@/lib/auth/provider-identity/types";
import {
  distinctProviders,
  findIdentitiesByEmailForConflict,
  findIdentityByProviderUserId,
  findProfileByProviderUserId,
} from "@/lib/auth/provider-identity/repository.server";
import {
  isApplePrivateRelayEmail,
  isEmailEligibleForConflictMatch,
  isEmailEligibleForPasswordMemberMatch,
  normalizeProviderEmail,
} from "@/lib/auth/provider-identity/email-policy";
import {
  classifyPasswordMemberGate,
  findPasswordMemberCandidateByVerifiedEmail,
} from "@/lib/auth/provider-identity/password-member-lookup.server";

/**
 * 로그인 후 provider 식별 정책:
 * A) (provider, provider_user_id) 존재 → 해당 user_id
 * B) profiles_fallback (Package C — unchanged this phase)
 * C) 동일 email 기존 social identity → email_conflict (자동 병합 금지)
 * D) Package D — verified provider email ↔ password Auth email → account_link_required / lifecycle deny
 * E) Kakao email 없음 / ineligible → new
 * F) Apple private relay → email 매칭 생략
 */
export async function resolveProviderLogin(
  sb: SupabaseClient,
  candidate: ProviderIdentityCandidate,
): Promise<ResolveProviderLoginResult> {
  const provider = candidate.provider;
  const providerUserId = candidate.providerUserId.trim();
  if (!providerUserId) {
    return {
      status: "provider_user_id_conflict",
      message: "provider_user_id is required",
      conflictReason: "POLICY_DATA_INCONSISTENT",
    };
  }

  const existing = await findIdentityByProviderUserId(sb, provider, providerUserId);
  if (existing) {
    if (existing.user_id) {
      return {
        status: "existing",
        userId: existing.user_id,
        identityId: existing.id,
        via: "user_auth_identities",
      };
    }
    return {
      status: "provider_user_id_conflict",
      message: "identity row missing user_id",
      conflictReason: "POLICY_DATA_INCONSISTENT",
    };
  }

  const profileFallback = await findProfileByProviderUserId(sb, provider, providerUserId);
  if (profileFallback?.id) {
    return {
      status: "existing",
      userId: profileFallback.id,
      identityId: null,
      via: "profiles_fallback",
    };
  }

  const email = normalizeProviderEmail(candidate.email);
  const emailIsRelay = candidate.emailIsPrivateRelay ?? isApplePrivateRelayEmail(email);

  if (provider === "kakao" && !email) {
    return { status: "new" };
  }

  if (!email || !isEmailEligibleForConflictMatch(email) || emailIsRelay) {
    return { status: "new" };
  }

  const emailMatches = await findIdentitiesByEmailForConflict(sb, email, provider);
  if (emailMatches.length > 0) {
    const byUser = new Map<string, typeof emailMatches>();
    for (const row of emailMatches) {
      const list = byUser.get(row.user_id) ?? [];
      list.push(row);
      byUser.set(row.user_id, list);
    }

    if (byUser.size > 1) {
      return {
        status: "provider_user_id_conflict",
        message: "동일 이메일로 등록된 계정이 여러 개 있습니다. 고객센터에 문의해 주세요.",
        conflictReason: "POLICY_DATA_INCONSISTENT",
      };
    }

    const [[existingUserId, rows]] = Array.from(byUser.entries());
    const existingProviders = distinctProviders(rows).filter((p) => p !== provider);

    if (existingProviders.length > 0) {
      return {
        status: "email_conflict",
        conflict: {
          email,
          attemptedProvider: provider,
          existingProviders,
          existingUserId,
        },
      };
    }
  }

  // Package D — only when result would otherwise be `new`.
  return resolvePasswordMemberEmailGate(sb, candidate, email);
}

async function resolvePasswordMemberEmailGate(
  sb: SupabaseClient,
  candidate: ProviderIdentityCandidate,
  email: string,
): Promise<ResolveProviderLoginResult> {
  // Trusted provider verification only — Boolean(email) is not evidence.
  if (candidate.emailVerified !== true) {
    return { status: "new" };
  }
  if (!isEmailEligibleForPasswordMemberMatch(email)) {
    return { status: "new" };
  }

  const lookup = await findPasswordMemberCandidateByVerifiedEmail(sb, email);
  if (lookup.status === "none") {
    return { status: "new" };
  }
  if (lookup.status === "ambiguous") {
    return {
      status: "provider_user_id_conflict",
      message: "동일 이메일로 등록된 계정이 여러 개 있습니다. 고객센터에 문의해 주세요.",
      conflictReason: "AMBIGUOUS_ACCOUNT_CONFLICT",
    };
  }

  const classified = classifyPasswordMemberGate(lookup.candidate);
  if (classified.kind === "account_link_required") {
    return {
      status: "account_link_required",
      reason: classified.reason,
      provider: candidate.provider,
      candidateUserId: classified.candidateUserId,
    };
  }
  if (classified.kind === "lifecycle_deny") {
    return {
      status: "lifecycle_denied",
      errorCode: classified.errorCode,
      message: classified.message,
    };
  }
  return {
    status: "provider_user_id_conflict",
    message: classified.message,
    conflictReason: "AMBIGUOUS_ACCOUNT_CONFLICT",
  };
}

export function buildProviderEmailConflictPayload(
  result: Extract<ResolveProviderLoginResult, { status: "email_conflict" }>,
) {
  return {
    errorCode: "provider_email_conflict" as const,
    email: result.conflict.email,
    attemptedProvider: result.conflict.attemptedProvider,
    existingProviders: result.conflict.existingProviders,
    existingUserId: result.conflict.existingUserId,
  };
}
