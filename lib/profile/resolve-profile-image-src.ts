/**
 * 프로필 사진 표시 판정 — **문자열만 본다 (네트워크 0)** · real-screen-redesign §14.
 *
 * - https + 허용 출처 → 그대로
 * - http + 허용 출처 → https 로 바꿔 사용 (원격 http 는 허용 목록에 넣지 않는다 — 혼합 콘텐츠 금지)
 * - 카카오 기본 이미지(`default_profile`) · 허용 밖 출처 · 빈 값 · DIBAY 기본 SVG → null (DIBAY 기본 아바타, 요청 0)
 * - 같은 사이트 상대 경로(`/…`)·`blob:`·`data:image/` (업로드 미리보기) → 그대로
 *
 * 허용 출처는 `next.config.js` `images.remotePatterns` 와 **같은 파일**(`config/image-remote-patterns.json`).
 * 저장 시 실검증(200 + image/*)은 서버 `verify-remote-profile-image.server.ts` 가 담당 — 표시 경로에서는 하지 않는다.
 */
import remotePatterns from "@/config/image-remote-patterns.json";
import { isSamarketDefaultAvatarUrl } from "@/lib/profile/default-avatar";

export type ImageRemotePattern = {
  protocol: "http" | "https";
  hostname: string;
  pathname: string;
};

export const IMAGE_REMOTE_PATTERNS = remotePatterns as readonly ImageRemotePattern[];

/** next/image `remotePatterns` 와 같은 의미: `*` = 하위 도메인 1단계, `**` = 여러 단계 */
function hostMatches(pattern: string, host: string): boolean {
  if (pattern === host) return true;
  if (pattern.startsWith("**.")) return host.endsWith(pattern.slice(2));
  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(1);
    if (!host.endsWith(suffix)) return false;
    const label = host.slice(0, host.length - suffix.length);
    return label.length > 0 && !label.includes(".");
  }
  return false;
}

function pathMatches(pattern: string, pathname: string): boolean {
  if (pattern === "/**") return true;
  if (pattern.endsWith("/**")) return pathname.startsWith(pattern.slice(0, -2));
  return pattern === pathname;
}

export function isAllowedRemoteImageUrl(url: URL, protocol: "http" | "https"): boolean {
  const host = url.hostname.toLowerCase();
  return IMAGE_REMOTE_PATTERNS.some(
    (p) => p.protocol === protocol && hostMatches(p.hostname, host) && pathMatches(p.pathname, url.pathname),
  );
}

/** 카카오 계정 기본 이미지 — 사용자 사진이 아니므로 DIBAY 기본 아바타로 대체 */
export function isKakaoDefaultProfileImage(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  if (!(host === "kakaocdn.net" || host.endsWith(".kakaocdn.net"))) return false;
  return /default_profile/i.test(decodeURIComponent(url.pathname + url.search));
}

/**
 * 표시용 프로필 사진 src — null 이면 DIBAY 기본 아바타.
 * 같은 입력 → 같은 출력이라 홈 카드·수정 시트가 같은 URL 1개를 공유한다(브라우저 캐시 공유).
 */
export function resolveProfileImageSrc(raw: string | null | undefined): string | null {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value || isSamarketDefaultAvatarUrl(value)) return null;
  if (value.startsWith("blob:") || /^data:image\//i.test(value)) return value;
  if (value.startsWith("/") && !value.startsWith("//")) return value;

  let url: URL;
  try {
    url = new URL(value.startsWith("//") ? `https:${value}` : value);
  } catch {
    return null;
  }
  if (isKakaoDefaultProfileImage(url)) return null;

  if (url.protocol === "https:") {
    return isAllowedRemoteImageUrl(url, "https") ? url.toString() : null;
  }
  if (url.protocol === "http:") {
    // 로컬 Supabase(`supabase start`) — 허용 목록에 http 로 등록된 출처만 그대로
    if (isAllowedRemoteImageUrl(url, "http")) return url.toString();
    const upgraded = new URL(url.toString());
    upgraded.protocol = "https:";
    return isAllowedRemoteImageUrl(upgraded, "https") ? upgraded.toString() : null;
  }
  return null;
}
