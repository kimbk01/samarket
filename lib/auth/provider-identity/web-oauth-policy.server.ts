import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isApplePrivateRelayEmail, normalizeProviderEmail } from "@/lib/auth/provider-identity/email-policy";
import { createConflictStashToken } from "@/lib/auth/provider-identity/link-token.server";
import { ensureProviderAuthIdentityRow } from "@/lib/auth/provider-identity/native-session-bridge.server";
import { resolveProviderLogin } from "@/lib/auth/provider-identity/resolve-provider-login.server";
import type { LinkableAuthProvider, ProviderIdentityCandidate } from "@/lib/auth/provider-identity/types";
import { isLinkableAuthProvider } from "@/lib/auth/provider-identity/provider-display";

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
  | { ok: true; candidate: ProviderIdentityCandidate | null }
  | {
      ok: false;
      errorCode: "provider_email_conflict" | "provider_account_conflict";
      message: string;
      conflict?: {
        email: string;
        attemptedProvider: LinkableAuthProvider;
        existingProviders: string[];
        stashToken: string;
      };
    };

export async function enforceWebOAuthProviderPolicy(
  sb: SupabaseClient,
  user: User,
): Promise<WebOAuthProviderPolicyResult> {
  const candidate = buildOAuthUserProviderCandidate(user);
  if (!candidate) {
    return { ok: true, candidate: null };
  }

  const resolved = await resolveProviderLogin(sb, candidate);

  if (resolved.status === "email_conflict") {
    const stashToken = createConflictStashToken(candidate);
    return {
      ok: false,
      errorCode: "provider_email_conflict",
      message: "보안을 위해 기존 로그인 확인이 필요합니다.",
      conflict: {
        email: resolved.conflict.email,
        attemptedProvider: resolved.conflict.attemptedProvider,
        existingProviders: resolved.conflict.existingProviders,
        stashToken,
      },
    };
  }

  if (resolved.status === "provider_user_id_conflict") {
    return {
      ok: false,
      errorCode: "provider_account_conflict",
      message: resolved.message,
    };
  }

  if (resolved.status === "existing" && resolved.userId !== user.id) {
    return {
      ok: false,
      errorCode: "provider_account_conflict",
      message: "이 로그인 계정은 다른 DIBAY 회원에 연결되어 있습니다.",
    };
  }

  return { ok: true, candidate };
}

export async function persistOAuthProviderIdentity(
  sb: SupabaseClient,
  userId: string,
  candidate: ProviderIdentityCandidate,
): Promise<void> {
  if (!candidate.providerUserId.trim()) return;
  await ensureProviderAuthIdentityRow(sb, userId, candidate);
}
