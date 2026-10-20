import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentProfile } from "@/lib/auth/server-guards";
import {
  invalidatePhoneVerifiedPositiveProfile,
  rememberPhoneVerifiedPositiveProfile,
} from "@/lib/auth/phone-verified-positive-cache";
import { hasVerifiedPhone } from "@/lib/auth/post-login-profile-policy";
import {
  checkMemberNicknameWritable,
  MEMBER_NICKNAME_TAKEN_MESSAGE,
} from "@/lib/profile/member-nickname-policy";

/** OTP 검증 성공 직후 — stale positive 캐시 제거 후 fresh profile 로 gate 캐시 재구성 */
export async function syncPhoneVerifiedServerCache(userId: string): Promise<void> {
  invalidatePhoneVerifiedPositiveProfile(userId);
  const profile = await getCurrentProfile(userId);
  if (!profile) return;
  const passes = hasVerifiedPhone({
    role: profile.role ?? null,
    privilegedAdmin: profile.privilegedAdmin === true,
    phone_verified: profile.phone_verified === true,
    phone_verified_at: profile.phone_verified_at ?? null,
    phone_verification_method: profile.phone_verification_method ?? null,
    provider: profile.provider ?? profile.auth_provider ?? null,
    auth_provider: profile.auth_provider ?? profile.provider ?? null,
    email: profile.email ?? null,
  });
  if (passes) {
    rememberPhoneVerifiedPositiveProfile(userId, profile);
  }
}

/**
 * 전화 인증 화면의 이름 입력 — 내정보와 같은 공개 이름 SSOT(`nickname`)로 저장한다.
 * 과거에는 `display_name` 만 바꿔 게시판(nickname 표시)과 이름이 어긋났다(감사 #4).
 * 빈 값이면 변경하지 않는다. 같은 값이면 쓰지 않는다.
 */
export async function patchProfileDisplayName(
  sb: SupabaseClient,
  userId: string,
  displayName: string,
): Promise<{ ok: true } | { ok: false; message: string; status: 400 | 409 | 500 }> {
  if (!String(displayName ?? "").trim()) return { ok: true };
  const { data: current } = await sb
    .from("profiles")
    .select("nickname, display_name")
    .eq("id", userId)
    .maybeSingle();
  const cur = (current ?? null) as { nickname?: string | null; display_name?: string | null } | null;
  const trimmed = String(displayName).trim();
  if (cur && (cur.nickname ?? "").trim() === trimmed && (cur.display_name ?? "").trim() === trimmed) {
    return { ok: true };
  }
  const check = await checkMemberNicknameWritable(sb, userId, trimmed);
  if (!check.ok) return { ok: false, message: check.message, status: check.status };
  const { error } = await sb
    .from("profiles")
    .update({ nickname: check.nickname, display_name: check.nickname, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) {
    const dup = error.code === "23505" || /duplicate|unique/i.test(error.message ?? "");
    return dup
      ? { ok: false, message: MEMBER_NICKNAME_TAKEN_MESSAGE, status: 409 }
      : { ok: false, message: "이름을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.", status: 500 };
  }
  return { ok: true };
}

/** OTP 발송·검증 전에 이름을 먼저 확인 — 발송 후 이름 오류로 인증만 진행되는 상태를 막는다 */
export async function precheckProfileDisplayName(
  sb: SupabaseClient,
  userId: string,
  displayName: string,
): Promise<{ ok: true } | { ok: false; message: string; status: 400 | 409 }> {
  if (!String(displayName ?? "").trim()) return { ok: true };
  const { data: current } = await sb.from("profiles").select("nickname").eq("id", userId).maybeSingle();
  const curNick = ((current as { nickname?: string | null } | null)?.nickname ?? "").trim();
  if (curNick && curNick === String(displayName).trim()) return { ok: true };
  const check = await checkMemberNicknameWritable(sb, userId, displayName);
  return check.ok ? { ok: true } : { ok: false, message: check.message, status: check.status };
}
