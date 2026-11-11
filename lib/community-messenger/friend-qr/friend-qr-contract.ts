/**
 * QR 친구 추가 계약 (설계안 v3 §3.6 · Owner 「3단계 시작」 2026-11-11)
 *
 * - QR 내용 = `{운영 주소}/f/{토큰}` — 토큰은 아이디를 담지 않는 무작위 22자 (DB `member_friend_qr`).
 *   운영 주소 = `DIBAY_PRODUCTION_SITE_ORIGIN` (설계안의 dibay.app 은 확인되지 않은 주소라 쓰지 않는다).
 * - 앱 링크 = `dibay://friend/{토큰}` (iOS 는 지금 앱에서 열림, Android 는 4단계 네이티브 반영 후).
 * - 읽을 수 있는 QR: 운영 주소·지금 보고 있는 주소의 `/f/{토큰}`, `dibay://friend/{토큰}`. 그 밖은 거부.
 */
import { DIBAY_PRODUCTION_SITE_ORIGIN } from "@/lib/platform/capacitor-server-url";

export const FRIEND_QR_TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;
export const FRIEND_QR_PATH_PREFIX = "/f/";
export const FRIEND_QR_DEEP_LINK_PREFIX = "dibay://friend/";
/** 메신저 홈이 받는 쿼리 — 스캔 결과 시트를 연다 */
export const FRIEND_QR_HOME_QUERY_KEY = "friendQr";

export function isFriendQrToken(value: unknown): value is string {
  return typeof value === "string" && FRIEND_QR_TOKEN_RE.test(value);
}

export function buildFriendQrUrl(token: string, origin: string = DIBAY_PRODUCTION_SITE_ORIGIN): string {
  return `${origin.replace(/\/$/, "")}${FRIEND_QR_PATH_PREFIX}${token}`;
}

export function buildFriendQrDeepLink(token: string): string {
  return `${FRIEND_QR_DEEP_LINK_PREFIX}${token}`;
}

export function buildFriendQrHomePath(token: string): string {
  return `/community-messenger?${FRIEND_QR_HOME_QUERY_KEY}=${encodeURIComponent(token)}`;
}

function allowedHosts(currentOrigin?: string | null): Set<string> {
  const hosts = new Set<string>();
  for (const o of [DIBAY_PRODUCTION_SITE_ORIGIN, currentOrigin]) {
    if (!o) continue;
    try {
      hosts.add(new URL(o).host.toLowerCase());
    } catch {
      /* 잘못된 주소는 건너뜀 */
    }
  }
  return hosts;
}

/** 스캔한 글자 → 토큰. 디바이 친구 QR 이 아니면 null */
export function parseFriendQrPayload(raw: string, currentOrigin?: string | null): string | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  if (text.toLowerCase().startsWith(FRIEND_QR_DEEP_LINK_PREFIX)) {
    const token = text.slice(FRIEND_QR_DEEP_LINK_PREFIX.length).split(/[?#/]/)[0] ?? "";
    return isFriendQrToken(token) ? token : null;
  }
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(url.host))) {
    return null;
  }
  if (!allowedHosts(currentOrigin).has(url.host.toLowerCase())) return null;
  if (!url.pathname.startsWith(FRIEND_QR_PATH_PREFIX)) return null;
  const token = url.pathname.slice(FRIEND_QR_PATH_PREFIX.length).replace(/\/$/, "");
  return isFriendQrToken(token) ? token : null;
}

/** API 가 밖으로 돌려주는 오류 코드 — 차단·QR 꺼짐·없는 QR 을 구분하지 않는다 (재감사 L1). 본인 QR·서버 문제만 따로 */
export function publicFriendQrErrorCode(code: string | null | undefined): "qr_self" | "qr_unusable" | "supabase_unavailable" {
  if (code === "qr_self") return "qr_self";
  if (code === "supabase_unavailable") return "supabase_unavailable";
  return "qr_unusable";
}

/** API 오류 코드 → 회원에게 보이는 문구는 하나 (이유를 밝히지 않음, 설계안 §3.6). 본인 QR 만 따로 */
export function friendQrErrorMessageKey(code: string | null | undefined): "friend_qr_err_self" | "friend_qr_err_unusable" {
  return code === "qr_self" ? "friend_qr_err_self" : "friend_qr_err_unusable";
}
