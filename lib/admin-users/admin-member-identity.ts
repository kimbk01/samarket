/**
 * Admin member identity HARD LOCK.
 * 회원 ID = @{profiles.dibay_id} only.
 * username = login alias.
 * display = display_name → nickname.
 */

import { isDibaySyntheticAuthEmail } from "@/lib/auth/synthetic-auth-email";
import type { AdminAuthProvider, AdminUser } from "@/lib/types/admin-user";
import { resolveDisplayName } from "@/lib/users/user-label";

export function adminMemberPublicIdAt(dibayId?: string | null): string {
  const raw = String(dibayId ?? "").trim().replace(/^@+/, "");
  return raw ? `@${raw}` : "";
}

export function adminMemberListDisplayName(input: {
  display_name?: string | null;
  displayName?: string | null;
  nickname?: string | null;
  email?: string | null;
  username?: string | null;
}): string {
  return resolveDisplayName({
    display_name: input.display_name ?? input.displayName,
    nickname: input.nickname,
    email: input.email,
    username: input.username,
  });
}

export function adminMemberNicknameSecondary(
  displayName: string,
  nickname?: string | null,
): string | null {
  const nick = String(nickname ?? "").trim();
  if (!nick) return null;
  if (nick.toLowerCase() === displayName.trim().toLowerCase()) return null;
  return nick;
}

export type AdminAuthEvidenceBadge = "email" | "phone" | "kakao" | "google" | "apple";

export function authEvidenceBadges(user: Pick<AdminUser, "email" | "phoneVerified" | "authProvider">): AdminAuthEvidenceBadge[] {
  const badges: AdminAuthEvidenceBadge[] = [];
  const email = user.email?.trim() ?? "";
  if (email && !isDibaySyntheticAuthEmail(email)) badges.push("email");
  if (user.phoneVerified === true) badges.push("phone");
  const provider = user.authProvider as AdminAuthProvider | undefined;
  if (provider === "kakao" || provider === "google" || provider === "apple") {
    badges.push(provider);
  }
  return badges;
}
