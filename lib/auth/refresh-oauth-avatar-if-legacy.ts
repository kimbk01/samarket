import { isSamarketDefaultAvatarUrl, withDefaultAvatar } from "@/lib/profile/default-avatar";
import { isLikelyUserUploadedAvatarUrl } from "@/lib/profile/user-avatar-display";
import type { OAuthProfileSeed } from "@/lib/auth/oauth-profile-seed";

export type OAuthAvatarProfileInput = {
  onboarding_completed_at?: string | null;
  avatar_url?: string | null;
};

function pickTrimmed(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** OAuth CDN 프로필 사진 URL */
function isLikelyOAuthProviderAvatarUrl(url: string): boolean {
  const u = url.toLowerCase();
  return (
    u.includes("googleusercontent.com") ||
    u.includes("ggpht.com") ||
    u.includes("kakaocdn.net") ||
    u.includes("pstatic.net")
  );
}

export function shouldRefreshAvatarFromOAuth(
  profile: OAuthAvatarProfileInput | null | undefined,
  avatarCandidate: string | null | undefined
): boolean {
  const candidate = pickTrimmed(avatarCandidate);
  const exAv = pickTrimmed(profile?.avatar_url);

  if (!candidate) return false;

  if (exAv && isLikelyUserUploadedAvatarUrl(exAv)) return false;

  if (!exAv || isSamarketDefaultAvatarUrl(exAv)) return true;

  if (!profile?.onboarding_completed_at && isLikelyOAuthProviderAvatarUrl(exAv)) {
    return true;
  }

  return false;
}

export function buildOAuthAvatarPatch(
  profile: OAuthAvatarProfileInput | null | undefined,
  seed: Pick<OAuthProfileSeed, "avatarCandidate">
): { avatar_url: string } | null {
  if (!shouldRefreshAvatarFromOAuth(profile, seed.avatarCandidate)) return null;
  const candidate = pickTrimmed(seed.avatarCandidate);
  if (!candidate) return null;
  return { avatar_url: candidate };
}

/** ensurePendingAuthProfileRow / ensureAuthProfileRow 공통 — OAuth·기본 아바타 패치 */
export function mergeOAuthAvatarIntoPatch(
  patch: Record<string, unknown>,
  profile: OAuthAvatarProfileInput,
  seed: Pick<OAuthProfileSeed, "avatarCandidate">
): void {
  const oauthAvatarPatch = buildOAuthAvatarPatch(profile, seed);
  if (oauthAvatarPatch) {
    patch.avatar_url = oauthAvatarPatch.avatar_url;
    return;
  }
  const exAv = pickTrimmed(profile.avatar_url);
  if (!exAv && !pickTrimmed(seed.avatarCandidate)) {
    patch.avatar_url = withDefaultAvatar(null);
  }
}

/** OAuth 사진 없음 → 디바이 기본 SVG */
export function resolveOAuthAvatarForProfile(
  profile: OAuthAvatarProfileInput | null | undefined,
  seed: Pick<OAuthProfileSeed, "avatarCandidate">
): string {
  const oauthAvatarPatch = buildOAuthAvatarPatch(profile, seed);
  if (oauthAvatarPatch) return oauthAvatarPatch.avatar_url;
  const exAv = pickTrimmed(profile?.avatar_url);
  if (exAv) return exAv;
  return withDefaultAvatar(seed.avatarCandidate);
}
