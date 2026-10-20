/**
 * 프로필 사진 **저장·갱신 시에만** 하는 원격 확인 (real-screen-redesign §14-1).
 *
 * - 표시 판정(`resolveProfileImageSrc`)으로 https 로 쓸 수 있는 값인지 먼저 거른다(허용 출처·카카오 기본 이미지 제외).
 * - 그 https URL 에 요청 1회(타임아웃 3초) → 200 + `image/*` 이면 https 값을 저장, 아니면 null(DIBAY 기본 아바타).
 * - 화면 렌더 경로에서는 절대 호출하지 않는다 (진입마다 외부 요청 금지).
 * - 기존 회원 DB 값 일괄 갱신은 별도 승인 항목 — 여기서는 새로 저장하는 값만 다룬다.
 */
import type { OAuthProfileSeed } from "@/lib/auth/oauth-profile-seed";
import {
  shouldRefreshAvatarFromOAuth,
  type OAuthAvatarProfileInput,
} from "@/lib/auth/refresh-oauth-avatar-if-legacy";
import { isSamarketDefaultAvatarUrl } from "@/lib/profile/default-avatar";
import { resolveProfileImageSrc } from "@/lib/profile/resolve-profile-image-src";

export const REMOTE_PROFILE_IMAGE_VERIFY_TIMEOUT_MS = 3_000;

export type VerifyRemoteProfileImageOpts = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

/** 저장할 사진 값 — 통과하면 https URL, 실패·허용 밖이면 null. DIBAY 기본 SVG·같은 사이트 경로는 그대로. */
export async function verifyRemoteProfileImageForSave(
  raw: string | null | undefined,
  opts?: VerifyRemoteProfileImageOpts,
): Promise<string | null> {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return null;
  if (isSamarketDefaultAvatarUrl(value)) return value;
  const src = resolveProfileImageSrc(value);
  if (!src) return null;
  if (!/^https:\/\//i.test(src)) {
    // 같은 사이트 상대 경로 · 로컬 Supabase(http 127.0.0.1/localhost) — 원격 확인 대상 아님
    return src.startsWith("/") || /^http:\/\/(127\.0\.0\.1|localhost)[:/]/i.test(src) ? src : null;
  }

  const fetchImpl = opts?.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts?.timeoutMs ?? REMOTE_PROFILE_IMAGE_VERIFY_TIMEOUT_MS);
  try {
    const res = await fetchImpl(src, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
    });
    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    // 본문은 읽지 않는다 — 헤더만 확인
    try {
      await res.body?.cancel();
    } catch {
      /* ignore */
    }
    return res.status === 200 && contentType.startsWith("image/") ? src : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * OAuth 시드의 사진 후보를 **실제로 기록할 때만** 확인해 바꾼 시드를 돌려준다.
 * - 기존 행이 있고 사진을 갱신하지 않는 경우(`shouldRefreshAvatarFromOAuth` false) → 요청 0, 시드 그대로.
 * - 후보가 기존 값과 같으면 → 요청 0.
 */
export async function withVerifiedOAuthAvatar<T extends Pick<OAuthProfileSeed, "avatarCandidate">>(
  seed: T,
  existing: OAuthAvatarProfileInput | null,
  opts?: VerifyRemoteProfileImageOpts,
): Promise<T> {
  const candidate = typeof seed.avatarCandidate === "string" ? seed.avatarCandidate.trim() : "";
  if (!candidate) return seed;
  if (existing) {
    if (!shouldRefreshAvatarFromOAuth(existing, candidate)) return seed;
    const current = typeof existing.avatar_url === "string" ? existing.avatar_url.trim() : "";
    if (current === candidate) return seed;
  }
  const verified = await verifyRemoteProfileImageForSave(candidate, opts);
  return { ...seed, avatarCandidate: verified };
}
