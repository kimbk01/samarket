import type { SupabaseClient } from "@supabase/supabase-js";
import { isDeletedStoreMember } from "@/lib/auth/store-member-policy";

type ProfileWithdrawalRow = {
  id?: string | null;
  status?: string | null;
  deleted_at?: string | null;
};

export function isActiveMemberProfile(
  row: ProfileWithdrawalRow | null | undefined
): row is ProfileWithdrawalRow & { id: string } {
  if (!row?.id) return false;
  return !isDeletedStoreMember(row);
}

/**
 * OAuth Native/Web 재가입 — 탈퇴(일반 삭제)된 profiles 행은 매칭에서 제외한다.
 * DB 영구 삭제(purge) 후에는 행 자체가 없으므로 null → 신규 auth·profile 생성 가능.
 */
export async function findActiveProfileIdByProviderUserId(
  sb: SupabaseClient,
  provider: string,
  providerUserId: string
): Promise<string | null> {
  const prov = String(provider ?? "").trim().toLowerCase();
  const uid = String(providerUserId ?? "").trim();
  if (!prov || !uid) return null;

  const { data, error } = await sb
    .from("profiles")
    .select("id, status, deleted_at")
    .eq("provider", prov)
    .eq("provider_user_id", uid)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as ProfileWithdrawalRow;
  if (!isActiveMemberProfile(row)) return null;
  return row.id;
}

/** ensureUserProfile duplicate 검사 — 활성 회원만 충돌 후보 */
export async function findActiveProfileIdsByProviderPair(
  sb: SupabaseClient,
  provider: string | null,
  providerUserId: string | null
): Promise<string[]> {
  if (!provider || !providerUserId) return [];
  const { data, error } = await sb
    .from("profiles")
    .select("id, status, deleted_at")
    .eq("provider", provider)
    .eq("provider_user_id", providerUserId)
    .limit(5);
  if (error || !Array.isArray(data)) return [];
  return data
    .filter((row) => isActiveMemberProfile(row as ProfileWithdrawalRow))
    .map((row) => String((row as { id?: unknown }).id ?? ""))
    .filter(Boolean);
}

/** ensureUserProfile duplicate 검사 — 활성 회원 email / auth_login_email */
export async function findActiveProfileIdsByEmail(
  sb: SupabaseClient,
  email: string | null
): Promise<string[]> {
  const e = String(email ?? "").trim().toLowerCase();
  if (!e) return [];

  const [byEmail, byAuthLoginEmail] = await Promise.all([
    sb.from("profiles").select("id, status, deleted_at").ilike("email", e).limit(5),
    sb.from("profiles").select("id, status, deleted_at").ilike("auth_login_email", e).limit(5),
  ]);

  const merged = [...(byEmail.data ?? []), ...(byAuthLoginEmail.data ?? [])];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of merged) {
    if (!isActiveMemberProfile(row as ProfileWithdrawalRow)) continue;
    const id = String((row as { id?: unknown }).id ?? "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
