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
      message: "계정 연결 요청이 만료되었거나 유효하지 않습니다.",
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
      message: "이미 연결된 로그인 방식입니다.",
    };
  }

  const taken = await findIdentityByProviderUserId(sb, provider, candidate.providerUserId);
  if (taken && taken.user_id !== userId) {
    return {
      ok: false,
      errorCode: "provider_user_id_taken",
      message: "이 로그인 계정은 다른 DIBAY 회원에 연결되어 있습니다.",
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
        message: "이 로그인 계정은 다른 DIBAY 회원에 연결되어 있습니다.",
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
      message: "최소 1개의 로그인 방법은 유지해야 합니다.",
    };
  }

  const target = identities.find((row) => row.provider === provider);
  if (!target) {
    return {
      ok: false,
      errorCode: "provider_not_linked",
      message: "연결된 로그인 방식이 아닙니다.",
    };
  }

  const deleted = await deleteUserAuthIdentity(sb, userId, provider);
  if (!deleted) {
    return {
      ok: false,
      errorCode: "provider_not_linked",
      message: "연결된 로그인 방식이 아닙니다.",
    };
  }

  return { ok: true };
}
