import type { User } from "@supabase/supabase-js";
import { normalizeStoreAuthProvider } from "@/lib/auth/store-member-policy";
import { isDibaySyntheticAuthEmail } from "@/lib/auth/synthetic-auth-email";

export type OAuthProfileSeed = {
  authProvider: string;
  nicknameCandidate: string | null;
  avatarCandidate: string | null;
  emailInternal: string | null;
};

function pickStr(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readIdentityDataValue(user: User, keys: string[]): string | null {
  const identities = Array.isArray(user.identities) ? user.identities : [];
  for (const identity of identities) {
    const data = (identity as { identity_data?: Record<string, unknown> | null }).identity_data;
    if (!data || typeof data !== "object") continue;
    for (const key of keys) {
      const value = pickStr((data as Record<string, unknown>)[key]);
      if (value) return value;
    }
  }
  return null;
}

function resolveProvider(user: User): string {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const fromMeta = pickStr(meta.provider) ?? pickStr(meta.auth_provider);
  const fromApp = pickStr(user.app_metadata?.provider);
  const identities = Array.isArray(user.identities) ? user.identities : [];
  const fromIdentity = identities.length
    ? pickStr((identities[0] as { provider?: unknown }).provider)
    : null;
  return (
    normalizeStoreAuthProvider(fromMeta ?? fromApp ?? fromIdentity) ?? "email"
  );
}

function resolveNicknameCandidate(user: User, provider: string): string | null {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  if (provider === "kakao") {
    return (
      pickStr(meta.nickname) ??
      pickStr(meta.profile_nickname) ??
      readIdentityDataValue(user, ["nickname", "profile_nickname", "name"])
    );
  }
  if (provider === "apple") {
    return (
      pickStr(meta.full_name) ??
      pickStr(meta.name) ??
      readIdentityDataValue(user, ["full_name", "name"])
    );
  }
  return (
    pickStr(meta.nickname) ??
    pickStr(meta.full_name) ??
    pickStr(meta.name) ??
    readIdentityDataValue(user, ["full_name", "name", "nickname"])
  );
}

function resolveAvatarCandidate(user: User, provider: string): string | null {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  if (provider === "kakao") {
    return (
      pickStr(meta.avatar_url) ??
      pickStr(meta.picture) ??
      readIdentityDataValue(user, ["avatar_url", "picture", "profile_image"])
    );
  }
  return (
    pickStr(meta.avatar_url) ??
    pickStr(meta.picture) ??
    pickStr(meta.photo_url) ??
    readIdentityDataValue(user, ["picture", "avatar_url", "photo_url"])
  );
}

function resolveEmailInternal(user: User, provider: string): string | null {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const hinted =
    pickStr(meta.google_email_hint) ??
    pickStr(meta.kakao_email_hint) ??
    (provider === "apple" ? pickStr(meta.email) : null);
  if (hinted && !isDibaySyntheticAuthEmail(hinted)) return hinted.toLowerCase();
  const raw = pickStr(user.email);
  if (raw && !isDibaySyntheticAuthEmail(raw)) return raw.toLowerCase();
  return null;
}

/** Google / Kakao / Apple — provider별 메타만 정규화, 온보딩 플로우는 공통 */
export function extractOAuthProfileSeed(user: User): OAuthProfileSeed {
  const authProvider = resolveProvider(user);
  return {
    authProvider,
    nicknameCandidate: resolveNicknameCandidate(user, authProvider),
    avatarCandidate: resolveAvatarCandidate(user, authProvider),
    emailInternal: resolveEmailInternal(user, authProvider),
  };
}
