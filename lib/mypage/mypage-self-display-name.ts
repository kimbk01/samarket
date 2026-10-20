import { resolveDisplayName } from "@/lib/users/user-label";

/**
 * 내정보(본인 화면) 표시 이름 — 공개 이름 SSOT `profiles.nickname` 우선 (lib/users/public-member-identity.ts).
 * 다른 회원에게 보이는 이름과 본인 화면 이름이 달라지지 않게 한다 (D14).
 * nickname 이 없는 레거시 행만 기존 대체 순서(display_name → 이메일 앞부분 → username).
 * 관리자 목록의 이름 규칙(admin-member-identity)은 관리자 계약이므로 여기서 바꾸지 않는다.
 */
export function resolveMypageSelfDisplayName(profile: {
  nickname?: string | null;
  display_name?: string | null;
  email?: string | null;
  username?: string | null;
} | null | undefined): string {
  if (!profile) return "";
  const nick = typeof profile.nickname === "string" ? profile.nickname.trim() : "";
  if (nick) return nick;
  return resolveDisplayName(profile);
}
