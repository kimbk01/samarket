import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileRow } from "./types";
import { fetchProfileRowSafe } from "./fetch-profile-row-safe";

/**
 * `profiles` 행이 없고 Supabase Auth 에 해당 사용자가 있으면 최소 행을 upsert 한다.
 * - 아이디 로그인 쿠키는 남는데 public TRUNCATE 등으로 profiles 만 비는 경우 복구
 * - test_users 가 있으면 username / display_name / role 반영
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

  const { data: tu } = await sb
    .from("test_users")
    .select("username, display_name, role")
    .eq("id", uid)
    .maybeSingle();
  const t = tu as { username?: string; display_name?: string; role?: string } | null;

  const username =
    (t?.username?.trim() || metaUser || (email && email.includes("@") ? email.split("@")[0] : null)) ?? null;
  const nicknameRaw =
    t?.display_name?.trim() || metaNick || username || (email && email.includes("@") ? email.split("@")[0] : null);
  const nickname = (nicknameRaw && nicknameRaw.length > 0 ? nicknameRaw : "회원").slice(0, 20);

  const tr = (t?.role ?? "member").toLowerCase();
  const isMaster = tr === "master";
  const isAdmin = tr === "admin" || isMaster;

  const profilePayload: Record<string, unknown> = {
    id: uid,
    email: email ?? (username ? `${username}@test.local` : null),
    username,
    nickname,
    role: isMaster ? "master" : isAdmin ? "admin" : "user",
    member_type: isAdmin ? "admin" : "normal",
    is_special_member: false,
    phone_verified: false,
    phone_verification_status: "unverified",
    realname_verified: false,
    status: "active",
    preferred_language: "ko",
    preferred_country: "PH",
    auth_provider:
      (typeof meta.auth_provider === "string" && meta.auth_provider.trim()) || "sync_from_auth",
    updated_at: new Date().toISOString(),
  };

  const { error: upErr } = await sb.from("profiles").upsert(profilePayload, { onConflict: "id" });
  if (upErr) return null;

  return (await fetchProfileRowSafe(sb, uid)) ?? null;
}
