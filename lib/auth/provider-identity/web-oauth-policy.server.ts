import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isApplePrivateRelayEmail, normalizeProviderEmail } from "@/lib/auth/provider-identity/email-policy";
import { createConflictStashToken } from "@/lib/auth/provider-identity/link-token.server";
import { ensureProviderAuthIdentityRow } from "@/lib/auth/provider-identity/native-session-bridge.server";
import { resolveProviderLogin } from "@/lib/auth/provider-identity/resolve-provider-login.server";
import type { LinkableAuthProvider, ProviderIdentityCandidate } from "@/lib/auth/provider-identity/types";
import { isLinkableAuthProvider } from "@/lib/auth/provider-identity/provider-display";
import {
  hashPrefixForAuthDiag,
  logWebOAuthProviderPolicyDiag,
  newWebOAuthCallbackAttemptId,
  type WebOAuthPolicyDiag,
} from "@/lib/auth/provider-identity/web-oauth-policy-diagnostics.server";

function pickStr(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Supabase OAuth User → provider identity candidate (google/kakao/apple). */
export function buildOAuthUserProviderCandidate(user: User): ProviderIdentityCandidate | null {
  const identities = Array.isArray(user.identities) ? user.identities : [];
  const oauthIdentity = identities.find((row) => {
    const p = String((row as { provider?: string }).provider ?? "").toLowerCase();
    return isLinkableAuthProvider(p);
  });
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

  const email = normalizeProviderEmail(user.email);
  const relay = isApplePrivateRelayEmail(email);

  return {
    provider,
    providerUserId,
    email: relay ? null : email,
    emailVerified: Boolean(email),
    emailIsPrivateRelay: relay,
    rawProfile: {
      sub: providerUserId,
      email,
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
      errorCode: "provider_email_conflict" | "provider_account_conflict";
      message: string;
      diag: WebOAuthPolicyDiag;
      conflict?: {
        email: string;
        attemptedProvider: LinkableAuthProvider;
        existingProviders: string[];
        stashToken: string;
      };
    };

async function profileExistsForUser(sb: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await sb.from("profiles").select("id").eq("id", userId).maybeSingle();
  if (error) return false;
  return Boolean(data?.id);
}

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
 * Web OAuth callback identity policy.
 * Does not auto-merge providers. Logs structured diagnostics without PII.
 */
export async function enforceWebOAuthProviderPolicy(
  sb: SupabaseClient,
  user: User,
  options?: { callbackAttemptId?: string },
): Promise<WebOAuthProviderPolicyResult> {
  const callbackAttemptId = options?.callbackAttemptId ?? newWebOAuthCallbackAttemptId();
  const candidate = buildOAuthUserProviderCandidate(user);
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

  const sessionHasProfile = await profileExistsForUser(sb, user.id);
  diag.orphanAuthUserDetected = !sessionHasProfile;

  const resolved = await resolveProviderLogin(sb, candidate);
  diag.resolveStatus = resolved.status;

  if (resolved.status === "new") {
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
    diag.existingProfileFound = await profileExistsForUser(sb, resolved.conflict.existingUserId);
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
  diag.existingProfileFound = await profileExistsForUser(sb, resolved.userId);
  diag.orphanProfileDetected = diag.existingProfileFound && !diag.existingProviderIdentityFound
    && resolved.via === "profiles_fallback";

  if (resolved.userId !== user.id) {
    // SSOT owner wins over Supabase-created parallel session user (FALSE CONFLICT rebind).
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

/** Slice 7-4 PLAN_I2 Auth Identity Row writer — delegates to ensureProviderAuthIdentityRow. */
export async function persistOAuthProviderIdentity(
  sb: SupabaseClient,
  userId: string,
  candidate: ProviderIdentityCandidate,
): Promise<void> {
  if (!candidate.providerUserId.trim()) return;
  await ensureProviderAuthIdentityRow(sb, userId, candidate);
}
