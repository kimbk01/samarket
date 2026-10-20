/**
 * 회원 공개 이름 SSOT — `profiles.nickname` (게시판·거래·메신저 표시: `lib/users/public-member-identity.ts`).
 * `profiles.display_name` 은 같은 값을 유지하는 레거시 사본이다. 모든 이름 쓰기 경로는
 * 같은 검증(2~20자 · 대소문자 무시 중복 금지)을 거쳐 두 컬럼을 함께 쓴다.
 *   - 내정보 PATCH `/api/me/profile`
 *   - 전화 인증 send/verify (`lib/auth/phone-otp-server-sync.ts`)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { escapeIlikePatternFragment } from "@/lib/community-messenger/profile-user-search-filter";

export const MEMBER_NICKNAME_MIN = 2;
export const MEMBER_NICKNAME_MAX = 20;

export type MemberNicknameCheck =
  | { ok: true; nickname: string }
  | { ok: false; status: 400 | 409; message: string };

export function validateMemberNicknameInput(raw: unknown): MemberNicknameCheck {
  const nickname = String(raw ?? "").trim();
  if (nickname.length < MEMBER_NICKNAME_MIN) {
    return { ok: false, status: 400, message: "닉네임은 2자 이상으로 입력해 주세요." };
  }
  if (nickname.length > MEMBER_NICKNAME_MAX) {
    return { ok: false, status: 400, message: "닉네임은 20자 이내로 입력해 주세요." };
  }
  return { ok: true, nickname };
}

/** 대소문자 무시 정확 일치 — `_`·`%` 는 이스케이프 (와일드카드 오탐 방지, 감사 #7) */
export async function isMemberNicknameTaken(
  sb: Pick<SupabaseClient, "from">,
  userId: string,
  nickname: string
): Promise<boolean> {
  const trimmed = nickname.trim();
  if (!trimmed) return false;
  const { data, error } = await sb
    .from("profiles")
    .select("id")
    .ilike("nickname", escapeIlikePatternFragment(trimmed))
    .neq("id", userId)
    .limit(1);
  if (error) return false;
  return Array.isArray(data) && data.length > 0;
}

export const MEMBER_NICKNAME_TAKEN_MESSAGE = "이미 사용 중인 닉네임입니다. 다른 닉네임을 입력해 주세요.";

/** 검증 + 중복 확인 (쓰기 전) */
export async function checkMemberNicknameWritable(
  sb: Pick<SupabaseClient, "from">,
  userId: string,
  raw: unknown
): Promise<MemberNicknameCheck> {
  const v = validateMemberNicknameInput(raw);
  if (!v.ok) return v;
  if (await isMemberNicknameTaken(sb, userId, v.nickname)) {
    return { ok: false, status: 409, message: MEMBER_NICKNAME_TAKEN_MESSAGE };
  }
  return v;
}
