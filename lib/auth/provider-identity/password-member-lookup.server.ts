import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  isBlockedMemberAccount,
  isSuspendedMemberAccount,
  isWithdrawnMemberAccount,
  type MemberAccountProfileLike,
} from "@/lib/auth/member-account-state";
import {
  isEmailEligibleForPasswordMemberMatch,
  normalizeProviderEmail,
} from "@/lib/auth/provider-identity/email-policy";

export const PROVIDER_ACCOUNT_LINK_REQUIRED = "provider_account_link_required" as const;

export const PROVIDER_ACCOUNT_LINK_REQUIRED_MESSAGE =
  "이 로그인 방법은 기존 계정 연결 확인이 필요합니다. 다른 로그인 방법을 사용하거나 고객지원에 문의해 주세요.";

export const PROVIDER_ACCOUNT_LINK_REQUIRED_REASON =
  "verified_social_email_matches_password_member" as const;

export type PasswordMemberCandidate = {
  userId: string;
  profileStatus: string | null;
  deletedAt: string | null;
};

export type PasswordMemberLookupResult =
  | { status: "none" }
  | { status: "one"; candidate: PasswordMemberCandidate }
  | { status: "ambiguous"; candidateCount: number };

export type PasswordMemberGateClassification =
  | {
      kind: "account_link_required";
      reason: typeof PROVIDER_ACCOUNT_LINK_REQUIRED_REASON;
      candidateUserId: string;
    }
  | {
      kind: "lifecycle_deny";
      errorCode: "account_suspended" | "account_blocked" | "account_withdrawn";
      message: string;
    }
  | { kind: "ambiguous_conflict"; message: string };

/** Auth Admin User has a password / email credential — not social-only. */
export function authUserHasPasswordCredential(user: User | null | undefined): boolean {
  if (!user) return false;
  const identities = Array.isArray(user.identities) ? user.identities : [];
  if (
    identities.some((row) => String(row.provider ?? "").trim().toLowerCase() === "email")
  ) {
    return true;
  }
  const providers = user.app_metadata?.providers;
  if (Array.isArray(providers)) {
    if (providers.some((p) => String(p ?? "").trim().toLowerCase() === "email")) {
      return true;
    }
  }
  const provider = String(user.app_metadata?.provider ?? "").trim().toLowerCase();
  if (provider === "email") return true;
  return false;
}

/**
 * Read-only: Auth email authority + password credential + profiles row.
 * Does not use profiles.email as ownership authority.
 */
export async function findPasswordMemberCandidateByVerifiedEmail(
  sb: SupabaseClient,
  email: string | null | undefined,
): Promise<PasswordMemberLookupResult> {
  const normalized = normalizeProviderEmail(email);
  if (!normalized || !isEmailEligibleForPasswordMemberMatch(normalized)) {
    return { status: "none" };
  }

  const matches = await findAuthUsersByNormalizedEmail(sb, normalized);
  if (matches.length === 0) return { status: "none" };
  if (matches.length > 1) {
    return { status: "ambiguous", candidateCount: matches.length };
  }

  const authUser = matches[0]!;
  if (!authUserHasPasswordCredential(authUser)) {
    return { status: "none" };
  }

  const userId = String(authUser.id ?? "").trim();
  if (!userId) return { status: "none" };

  const { data: profile, error } = await sb
    .from("profiles")
    .select("id, status, deleted_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!profile?.id) return { status: "none" };

  return {
    status: "one",
    candidate: {
      userId,
      profileStatus: typeof profile.status === "string" ? profile.status : null,
      deletedAt: typeof profile.deleted_at === "string" ? profile.deleted_at : null,
    },
  };
}

export function classifyPasswordMemberGate(
  candidate: PasswordMemberCandidate,
): PasswordMemberGateClassification {
  const profile: MemberAccountProfileLike = {
    status: candidate.profileStatus,
    deleted_at: candidate.deletedAt,
  };

  if (isWithdrawnMemberAccount(profile)) {
    return {
      kind: "lifecycle_deny",
      errorCode: "account_withdrawn",
      message: "탈퇴한 계정입니다. 다시 이용하려면 새로 가입해 주세요.",
    };
  }
  if (isBlockedMemberAccount(profile)) {
    return {
      kind: "lifecycle_deny",
      errorCode: "account_blocked",
      message: "이용이 차단된 계정입니다. 관리자 차단 해제 후 다시 로그인해 주세요.",
    };
  }
  if (isSuspendedMemberAccount(profile)) {
    return {
      kind: "lifecycle_deny",
      errorCode: "account_suspended",
      message: "이 회원은 현재 활동이 제한되어 있습니다.",
    };
  }

  // active / verified_user / sns_pending / empty → link gate (profile exists, non-disposable)
  return {
    kind: "account_link_required",
    reason: PROVIDER_ACCOUNT_LINK_REQUIRED_REASON,
    candidateUserId: candidate.userId,
  };
}

async function findAuthUsersByNormalizedEmail(
  sb: SupabaseClient,
  normalizedEmail: string,
): Promise<User[]> {
  const perPage = 200;
  const hits: User[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message || "list_users_failed");
    const users = Array.isArray(data?.users) ? data.users : [];
    for (const user of users) {
      const email = normalizeProviderEmail(user.email);
      if (email === normalizedEmail) hits.push(user);
    }
    if (users.length < perPage) break;
  }
  return hits;
}
