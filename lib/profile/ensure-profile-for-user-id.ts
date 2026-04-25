import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileRow } from "./types";
import { fetchProfileRowSafe } from "./fetch-profile-row-safe";
import { normalizeAppLanguage } from "@/lib/i18n/config";
import { normalizeStoreAuthProvider } from "@/lib/auth/store-member-policy";

/**
 * `profiles` 행이 없고 Supabase Auth 에 해당 사용자가 있으면 최소 행을 upsert 한다.
 * - 아이디 로그인 쿠키는 남는데 public TRUNCATE 등으로 profiles 만 비는 경우 복구
 */
export async function ensureProfileForUserId(
  sb: SupabaseClient<any>,
  userId: string
): Promise<ProfileRow | null> {
  const uid = userId.trim();
  if (!uid) return null;

  const existing = await fetchProfileRowSafe(sb, uid);
  if (existing) return existing;

  const { data: authWrap, error: authErr } = await sb.auth.admin.getUserById(uid);
  if (authErr || !authWrap?.user) return null;

  const user = authWrap.user;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const metaUser =
    (typeof meta.username === "string" && meta.username.trim()) ||
    (typeof meta.login_id === "string" && meta.login_id.trim()) ||
    null;
  const metaNick =
    (typeof meta.nickname === "string" && meta.nickname.trim()) || metaUser || null;
  const email = user.email?.trim() ?? null;
  const preferredLanguage = normalizeAppLanguage(meta.preferred_language);
  const username =
    (metaUser || (email && email.includes("@") ? email.split("@")[0] : null)) ?? null;
  const nicknameRaw =
    metaNick || username || (email && email.includes("@") ? email.split("@")[0] : null);
  const nickname = (nicknameRaw && nicknameRaw.length > 0 ? nicknameRaw : "회원").slice(0, 20);
  const provider =
    (typeof meta.provider === "string" && meta.provider.trim()) ||
    (typeof meta.auth_provider === "string" && meta.auth_provider.trim()) ||
    (typeof user.app_metadata?.provider === "string" && user.app_metadata.provider.trim()) ||
    "email";
  const normalizedProvider = normalizeStoreAuthProvider(provider) ?? "email";
  const nowIso = new Date().toISOString();
  const isAdminManual = normalizedProvider === "admin_manual";

  const profilePayload: Record<string, unknown> = {
    id: uid,
    email,
    display_name: nickname,
    username,
    nickname,
    auth_login_email: email,
    role: "user",
    is_admin: false,
    member_type: "normal",
    is_special_member: false,
    phone_verified: isAdminManual,
    phone_verified_at: isAdminManual ? nowIso : null,
    phone_verification_status: isAdminManual ? "verified" : "unverified",
    phone_verification_method: isAdminManual ? "admin_manual" : null,
    realname_verified: false,
    status: "active",
    member_status: isAdminManual ? "verified_member" : "sns_member",
    preferred_language: preferredLanguage,
    preferred_country: "PH",
    provider: normalizedProvider,
    auth_provider: normalizedProvider,
    phone_country_code: "+63",
    updated_at: nowIso,
  };

  const { error: upErr } = await sb.from("profiles").upsert(profilePayload, { onConflict: "id" });
  if (upErr) return null;

  return (await fetchProfileRowSafe(sb, uid)) ?? null;
}
