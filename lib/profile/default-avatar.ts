export const SAMARKET_DEFAULT_AVATAR_URL = "/samarket-default-avatar.svg" as const;

export function isSamarketDefaultAvatarUrl(avatarUrl: string | null | undefined): boolean {
  return typeof avatarUrl === "string" && avatarUrl.trim() === SAMARKET_DEFAULT_AVATAR_URL;
}

export function withDefaultAvatar(avatarUrl: string | null | undefined): string {
  const trimmed = typeof avatarUrl === "string" ? avatarUrl.trim() : "";
  return trimmed || SAMARKET_DEFAULT_AVATAR_URL;
}
