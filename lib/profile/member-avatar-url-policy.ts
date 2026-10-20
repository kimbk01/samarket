import { SAMARKET_DEFAULT_AVATAR_URL } from "@/lib/profile/default-avatar";

/**
 * 회원 프로필 사진(`profiles.avatar_url`) 허용 규칙 — API(L1) 와 DB 트리거(L2,
 * `public.is_allowed_member_avatar_url`) 가 같은 규칙을 쓴다.
 *
 * 회원이 바꿀 때 허용:
 *  - 빈 값(null)
 *  - 기본 그림 `/samarket-default-avatar.svg`
 *  - 본인 프로필 폴더 원본: `<origin>/storage/v1/object/public/post-images/<본인 uid>/profile/<uuid>.(jpg|jpeg|png|webp)`
 *  - 지금 저장된 값 그대로(소셜 로그인 사진 등 서버가 넣은 기존 값 보존)
 * 그 외(다른 회원 경로·외부 주소·쿼리·`..`·파생본)는 거부.
 */

const UUID_RE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const OWN_PROFILE_FILE_RE = new RegExp(`^${UUID_RE}\\.(jpg|jpeg|png|webp)$`);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** `NEXT_PUBLIC_SUPABASE_URL` → `https://<ref>.supabase.co` (없거나 형식 오류면 null) */
export function resolveMemberAvatarStorageOrigin(
  supabaseUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL
): string | null {
  const raw = supabaseUrl?.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return null;
    return u.origin;
  } catch {
    return null;
  }
}

/** Storage 경로가 본인 프로필 폴더 원본인지 (`<uid>/profile/<uuid>.<ext>`) */
export function isOwnProfileAvatarStoragePath(ownerUserId: string, storagePath: string): boolean {
  const owner = ownerUserId.trim().toLowerCase();
  if (!owner) return false;
  const prefix = `${owner}/profile/`;
  if (!storagePath.startsWith(prefix)) return false;
  return OWN_PROFILE_FILE_RE.test(storagePath.slice(prefix.length));
}

export function isOwnProfileAvatarPublicUrl(
  ownerUserId: string,
  url: string,
  storageOrigin: string | null
): boolean {
  if (!storageOrigin) return false;
  const owner = ownerUserId.trim().toLowerCase();
  if (!owner) return false;
  const re = new RegExp(
    `^${escapeRegExp(storageOrigin)}/storage/v1/object/public/post-images/${escapeRegExp(owner)}/profile/${UUID_RE}\\.(jpg|jpeg|png|webp)$`
  );
  return re.test(url);
}

export function isAllowedMemberAvatarUrl(args: {
  ownerUserId: string;
  url: string | null;
  currentUrl: string | null | undefined;
  storageOrigin: string | null;
}): boolean {
  const { ownerUserId, url, currentUrl, storageOrigin } = args;
  if (url === null) return true;
  if (url === SAMARKET_DEFAULT_AVATAR_URL) return true;
  if (currentUrl != null && url === currentUrl) return true;
  return isOwnProfileAvatarPublicUrl(ownerUserId, url, storageOrigin);
}
