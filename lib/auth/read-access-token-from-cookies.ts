/**
 * Phase 3-1 (docs/audit/phase3-auth-request-structure-design-2026-11-08.md §3-1 · Auth HARD LOCK Amendment 2026-11-08 (6)).
 *
 * Supabase 세션 쿠키(`sb-<ref>-auth-token`, 청크 `.0 .1 …`, `base64-` 인코딩)에서 access token 과 만료 시각만 읽는다.
 * `@supabase/ssr` 가 같은 쿠키를 읽을 때 쓰는 공개 함수(`combineChunks`·`stringFromBase64URL`)를 그대로 쓴다.
 *
 * - 서명 검증은 하지 않는다 — 이 값은 `auth.getClaims(token)` 로 검증하거나(게이트), 갱신 시점 판단(proxy)에만 쓴다.
 * - 세션을 로드·갱신하지 않는다. 읽기 실패는 null (호출자는 기존 경로로 폴백).
 */
import { combineChunks, stringFromBase64URL } from "@supabase/ssr";

export type CookiePair = { name: string; value: string };

export type CookieAccessToken = {
  accessToken: string;
  /** 초 단위 epoch (세션 `expires_at`, 없으면 JWT `exp`). 모르면 null. */
  expiresAtSec: number | null;
};

const BASE64_PREFIX = "base64-";
const AUTH_TOKEN_COOKIE_RE = /^(sb-[^.]+-auth-token)(?:\.\d+)?$/;

/** NEXT_PUBLIC_SUPABASE_URL 의 프로젝트 ref → 기본 저장 키 (supabase-js 기본값과 동일). */
export function supabaseAuthCookieKeyFromUrl(url: string | undefined | null): string | null {
  try {
    const host = new URL(String(url ?? "")).hostname;
    const ref = host.split(".")[0];
    return ref ? `sb-${ref}-auth-token` : null;
  } catch {
    return null;
  }
}

function pickKey(cookies: CookiePair[], preferredKey: string | null): string | null {
  const keys = new Set<string>();
  for (const c of cookies) {
    const m = AUTH_TOKEN_COOKIE_RE.exec(c.name);
    if (m) keys.add(m[1]);
  }
  if (preferredKey && keys.has(preferredKey)) return preferredKey;
  // 다른 프로젝트 쿠키가 섞여 있으면 고르지 않는다 (잘못된 사용자 판정 금지).
  return keys.size === 1 ? [...keys][0] : null;
}

function decodeJwtExp(token: string): number | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const payload = JSON.parse(stringFromBase64URL(part)) as { exp?: unknown };
    return typeof payload.exp === "number" && Number.isFinite(payload.exp) ? payload.exp : null;
  } catch {
    return null;
  }
}

export async function readAccessTokenFromCookies(
  cookies: CookiePair[],
  supabaseUrl: string | undefined | null = process.env.NEXT_PUBLIC_SUPABASE_URL
): Promise<CookieAccessToken | null> {
  try {
    const key = pickKey(cookies, supabaseAuthCookieKeyFromUrl(supabaseUrl));
    if (!key) return null;
    const raw = await combineChunks(key, (name) => cookies.find((c) => c.name === name)?.value ?? null);
    if (!raw) return null;
    const json = raw.startsWith(BASE64_PREFIX) ? stringFromBase64URL(raw.slice(BASE64_PREFIX.length)) : raw;
    const session = JSON.parse(json) as { access_token?: unknown; expires_at?: unknown };
    const accessToken = typeof session.access_token === "string" ? session.access_token.trim() : "";
    if (!accessToken || accessToken.split(".").length !== 3) return null;
    const expiresAtSec =
      typeof session.expires_at === "number" && Number.isFinite(session.expires_at)
        ? session.expires_at
        : decodeJwtExp(accessToken);
    return { accessToken, expiresAtSec };
  } catch {
    return null;
  }
}

/** auth-js 와 같은 기준: 만료 90초 이내면 갱신 대상 (`EXPIRY_MARGIN_MS = 3 × 30s`). */
export const SUPABASE_REFRESH_MARGIN_SEC = 90;

export function isAccessTokenWithinRefreshMargin(expiresAtSec: number | null, nowMs: number = Date.now()): boolean {
  if (expiresAtSec == null) return true;
  return expiresAtSec * 1000 - nowMs <= SUPABASE_REFRESH_MARGIN_SEC * 1000;
}
