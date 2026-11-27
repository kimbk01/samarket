import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  LinkableAuthProvider,
  ProviderIdentityCandidate,
  ProviderLinkCompleteResult,
} from "@/lib/auth/provider-identity/types";
import {
  deleteUserAuthIdentity,
  findIdentitiesByUserId,
  findIdentityByProviderUserId,
  insertUserAuthIdentity,
} from "@/lib/auth/provider-identity/repository.server";
import { verifyProviderLinkToken } from "@/lib/auth/provider-identity/link-token.server";

export async function completeProviderLink(
  sb: SupabaseClient,
  userId: string,
  linkToken: string,
): Promise<ProviderLinkCompleteResult> {
  const pending = verifyProviderLinkToken(linkToken, userId);
  if (!pending) {
    return {
      ok: false,
      errorCode: "provider_link_token_invalid",
      message: "provider_link_token_invalid",
    };
  }

  const candidate = pending.candidate;
  const provider = candidate.provider;

  const existingForUser = await findIdentitiesByUserId(sb, userId);
  const alreadyLinked = existingForUser.some((row) => row.provider === provider);
  if (alreadyLinked) {
    return {
      ok: false,
      errorCode: "provider_already_linked",
      message: "provider_already_linked",
    };
  }

  const taken = await findIdentityByProviderUserId(sb, provider, candidate.providerUserId);
  if (taken && taken.user_id !== userId) {
    return {
      ok: false,
      errorCode: "provider_user_id_taken",
      message: "provider_user_id_taken",
    };
  }

  try {
    await insertUserAuthIdentity(sb, userId, candidate);
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === "23505") {
      return {
        ok: false,
        errorCode: "provider_user_id_taken",
        message: "provider_user_id_taken",
      };
    }
    throw err;
  }

  await syncProfilePrimaryProvider(sb, userId, provider, candidate);

  return { ok: true, provider };
}

async function syncProfilePrimaryProvider(
  sb: SupabaseClient,
  userId: string,
  provider: LinkableAuthProvider,
  candidate: ProviderIdentityCandidate,
): Promise<void> {
  const { data: profile } = await sb
    .from("profiles")
    .select("provider, provider_user_id")
    .eq("id", userId)
    .maybeSingle();

  if (!profile?.provider_user_id) {
    await sb
      .from("profiles")
      .update({
        provider,
        provider_user_id: candidate.providerUserId,
        auth_provider: provider,
      })
      .eq("id", userId);
  }
}

export async function unlinkProvider(
  sb: SupabaseClient,
  userId: string,
  provider: LinkableAuthProvider,
): Promise<{ ok: true } | { ok: false; errorCode: string; message: string }> {
  const identities = await findIdentitiesByUserId(sb, userId);
  const linkable = identities.filter((row) =>
    row.provider === "google" || row.provider === "kakao" || row.provider === "apple",
  );

  if (linkable.length <= 1) {
    return {
      ok: false,
      errorCode: "last_provider_unlink_blocked",
      message: "last_provider_unlink_blocked",
    };
  }

  const target = identities.find((row) => row.provider === provider);
  if (!target) {
    return {
      ok: false,
      errorCode: "provider_not_linked",
      message: "provider_not_linked",
    };
  }

  const deleted = await deleteUserAuthIdentity(sb, userId, provider);
  if (!deleted) {
    return {
      ok: false,
      errorCode: "provider_not_linked",
      message: "provider_not_linked",
    };
  }

  await clearProfileFallbackForUnlinkedProvider(sb, userId, provider, target.provider_user_id);

  return { ok: true };
}

/**
 * OA-16 — identity row 삭제 후에도 `profiles_fallback`(provider + provider_user_id)이
 * 같은 공급자 로그인을 이 회원으로 되살리지 않도록, profiles.provider 가 해제 공급자일 때만
 * provider_user_id 를 비운다 (다른 공급자 식별값은 건드리지 않는다).
 */
async function clearProfileFallbackForUnlinkedProvider(
  sb: SupabaseClient,
  userId: string,
  provider: LinkableAuthProvider,
  unlinkedProviderUserId: string | null | undefined,
): Promise<void> {
  const { data: profile, error } = await sb
    .from("profiles")
    .select("provider, provider_user_id")
    .eq("id", userId)
    .maybeSingle();
  if (error || !profile) return;
  const row = profile as { provider?: string | null; provider_user_id?: string | null };
  if (String(row.provider ?? "").trim().toLowerCase() !== provider) return;
  const current = String(row.provider_user_id ?? "").trim();
  if (!current) return;
  const unlinkedSubject = String(unlinkedProviderUserId ?? "").trim();
  if (unlinkedSubject && current !== unlinkedSubject) return;
  await sb
    .from("profiles")
    .update({ provider_user_id: null, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .eq("provider", provider);
}

/** OA-16 — 연결 해제는 최근 10분 내 로그인(재인증)한 세션만 허용. */
export const PROVIDER_UNLINK_REAUTH_WINDOW_MS = 10 * 60 * 1000;

export function isRecentSignInForSensitiveAction(
  lastSignInAt: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  const ts = Date.parse(String(lastSignInAt ?? ""));
  if (!Number.isFinite(ts)) return false;
  return nowMs - ts <= PROVIDER_UNLINK_REAUTH_WINDOW_MS && ts <= nowMs + 60_000;
}
