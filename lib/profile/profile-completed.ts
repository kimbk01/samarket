import { hasCustomUserAvatar } from "@/lib/profile/user-avatar-display";

const DEFAULT_DIBAY_PUBLIC_ID_PATTERN = /^dibay_[A-Fa-f0-9]{6}$/;

/** 가입 직후 자동 부여되는 기본 공개 ID (`dibay_XXXXXX`) */
export function isDefaultDibayPublicId(value: string | null | undefined): boolean {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return Boolean(trimmed && DEFAULT_DIBAY_PUBLIC_ID_PATTERN.test(trimmed));
}

export type ProfileCompletedFields = {
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
};

/**
 * profile_completed=true 조건 — username·display_name·커스텀 아바타 모두 충족할 때만.
 */
export function computeProfileCompleted(fields: ProfileCompletedFields): boolean {
  const username = typeof fields.username === "string" ? fields.username.trim() : "";
  const displayName = typeof fields.display_name === "string" ? fields.display_name.trim() : "";

  if (!username || !displayName) return false;
  if (isDefaultDibayPublicId(username) || isDefaultDibayPublicId(displayName)) return false;
  if (!hasCustomUserAvatar(fields.avatar_url)) return false;

  return true;
}
