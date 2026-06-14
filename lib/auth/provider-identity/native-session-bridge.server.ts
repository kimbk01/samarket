import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppleVerifiedIdentityToken } from "@/lib/auth/native/apple-token-verify.server";
import type { GoogleVerifiedIdentity } from "@/lib/auth/native/google-token-verify.server";
import type { KakaoVerifiedIdentity } from "@/lib/auth/native/kakao-token-verify.server";
import { logOAuthNativeEvent } from "@/lib/auth/oauth/oauth-native-callback-log";
import { isApplePrivateRelayEmail } from "@/lib/auth/provider-identity/email-policy";
import { createConflictStashToken } from "@/lib/auth/provider-identity/link-token.server";
import {
  buildProviderEmailConflictPayload,
  resolveProviderLogin,
} from "@/lib/auth/provider-identity/resolve-provider-login.server";
import {
  findIdentityByProviderUserId,
  insertUserAuthIdentity,
} from "@/lib/auth/provider-identity/repository.server";
import type {
  LinkableAuthProvider,
  ProviderIdentityCandidate,
  ProviderEmailConflictDetail,
} from "@/lib/auth/provider-identity/types";

export type NativeSessionPreludeFailure = {
  ok: false;
  errorCode: string;
  message: string;
  status: number;
  conflict?: ProviderEmailConflictDetail & { stashToken: string };
};

export type NativeSessionPreludeSuccess = {
  ok: true;
  existingUserId: string | null;
  identityId: string | null;
};

export function buildGoogleProviderCandidate(verified: GoogleVerifiedIdentity): ProviderIdentityCandidate {
  const email =
    verified.emailVerified && verified.email?.trim() ? verified.email.trim().toLowerCase() : null;
  return {
    provider: "google",
    providerUserId: verified.googleUserId,
    email,
    emailVerified: verified.emailVerified,
    emailIsPrivateRelay: false,
    rawProfile: {
      sub: verified.googleUserId,
      email,
      email_verified: verified.emailVerified,
      name: verified.name ?? null,
      picture: verified.picture ?? null,
    },
  };
}

export function buildKakaoProviderCandidate(verified: KakaoVerifiedIdentity): ProviderIdentityCandidate {
  const email =
    verified.hasEmailFromProfile && verified.email?.trim()
      ? verified.email.trim().toLowerCase()
      : null;
  return {
    provider: "kakao",
    providerUserId: verified.kakaoUserId,
    email,
    emailVerified: Boolean(email),
    emailIsPrivateRelay: false,
    rawProfile: {
      id: verified.kakaoUserId,
      kakao_account: { email },
      profile: {
        nickname: verified.nickname ?? null,
        profile_image_url: verified.profileImageUrl ?? null,
      },
    },
  };
}

export function buildAppleProviderCandidate(
  verified: AppleVerifiedIdentityToken,
  userIdentifier?: string | null,
): ProviderIdentityCandidate {
  const relay = verified.isPrivateRelayEmail || isApplePrivateRelayEmail(verified.email);
  if (relay) {
    logOAuthNativeEvent("auth_provider_private_relay_detected", {
      provider: "apple",
      sub: verified.sub,
    });
  }
  const email = relay || !verified.email ? null : verified.email.trim().toLowerCase();
  return {
    provider: "apple",
    providerUserId: verified.sub,
    email,
    emailVerified: Boolean(email),
    emailIsPrivateRelay: relay,
    rawProfile: {
      sub: verified.sub,
      email,
      is_private_relay: relay,
      user_identifier: userIdentifier ?? null,
    },
  };
}

export async function resolveNativeProviderSessionPrelude(
  sb: SupabaseClient,
  candidate: ProviderIdentityCandidate,
): Promise<NativeSessionPreludeSuccess | NativeSessionPreludeFailure> {
  const resolved = await resolveProviderLogin(sb, candidate);

  if (resolved.status === "existing") {
    return {
      ok: true,
      existingUserId: resolved.userId,
      identityId: resolved.identityId,
    };
  }

  if (resolved.status === "email_conflict") {
    const stashToken = createConflictStashToken(candidate);
    return {
      ok: false,
      errorCode: "provider_email_conflict",
      message: "보안을 위해 기존 로그인 확인이 필요합니다.",
      status: 409,
      conflict: {
        ...resolved.conflict,
        stashToken,
      },
    };
  }

  if (resolved.status === "provider_user_id_conflict") {
    return {
      ok: false,
      errorCode: "provider_account_conflict",
      message: resolved.message,
      status: 409,
    };
  }

  return { ok: true, existingUserId: null, identityId: null };
}

export async function ensureProviderAuthIdentityRow(
  sb: SupabaseClient,
  userId: string,
  candidate: ProviderIdentityCandidate,
): Promise<void> {
  const existing = await findIdentityByProviderUserId(
    sb,
    candidate.provider,
    candidate.providerUserId,
  );
  if (existing) {
    if (existing.user_id !== userId) {
      throw new Error("provider_user_id already linked to another user");
    }
    return;
  }

  const { data: sameProvider } = await sb
    .from("user_auth_identities")
    .select("id")
    .eq("user_id", userId)
    .eq("provider", candidate.provider)
    .maybeSingle();

  if (sameProvider?.id) {
    return;
  }

  try {
    await insertUserAuthIdentity(sb, userId, candidate);
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === "23505") {
      const taken = await findIdentityByProviderUserId(
        sb,
        candidate.provider,
        candidate.providerUserId,
      );
      if (taken?.user_id === userId) return;
      throw err;
    }
    throw err;
  }
}

export function toExchangeConflictBody(
  failure: Extract<NativeSessionPreludeFailure, { conflict?: unknown }>,
) {
  if (!failure.conflict) return {};
  const payload = buildProviderEmailConflictPayload({
    status: "email_conflict",
    conflict: failure.conflict,
  });
  return {
    ...payload,
    stashToken: failure.conflict.stashToken,
  };
}

export function isLinkableProvider(value: string): value is LinkableAuthProvider {
  return value === "google" || value === "kakao" || value === "apple";
}
