export const LINKABLE_AUTH_PROVIDERS = ["google", "kakao", "apple"] as const;

export type LinkableAuthProvider = (typeof LINKABLE_AUTH_PROVIDERS)[number];

export type StoredAuthProvider = LinkableAuthProvider | "naver" | "facebook" | "email";

export type UserAuthIdentityRow = {
  id: string;
  user_id: string;
  provider: StoredAuthProvider;
  provider_user_id: string;
  email: string | null;
  email_verified: boolean;
  email_is_private_relay: boolean;
  raw_profile: Record<string, unknown>;
  linked_at: string;
  created_at: string;
};

export type ProviderIdentityCandidate = {
  provider: LinkableAuthProvider;
  providerUserId: string;
  email?: string | null;
  emailVerified?: boolean;
  emailIsPrivateRelay?: boolean;
  rawProfile?: Record<string, unknown>;
};

export type ProviderEmailConflictDetail = {
  email: string;
  attemptedProvider: LinkableAuthProvider;
  existingProviders: StoredAuthProvider[];
  existingUserId: string;
};

export type ResolveProviderLoginResult =
  | { status: "existing"; userId: string; identityId: string | null }
  | { status: "new" }
  | { status: "email_conflict"; conflict: ProviderEmailConflictDetail }
  | { status: "provider_user_id_conflict"; message: string };

export type ProviderLinkStartResult =
  | { ok: true; linkToken: string; expiresAt: string }
  | { ok: false; errorCode: string; message: string };

export type ProviderLinkCompleteResult =
  | { ok: true; provider: LinkableAuthProvider }
  | { ok: false; errorCode: string; message: string };
