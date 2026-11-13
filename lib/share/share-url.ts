/**
 * DIBAY 통합 공유 — 링크 주소 (Share URL Resolver · S1).
 * 설계: docs/audit/dibay-unified-share-audit-design-2026-11-14.md §D-2 · §I-5 · §J-1.
 *
 * - 운영 공유 링크 = 운영 origin 하나(`NEXT_PUBLIC_SITE_URL`, 없으면 `DIBAY_PRODUCTION_SITE_ORIGIN`).
 * - `VERCEL_URL`(배포마다 바뀌는 주소)은 쓰지 않는다 — 미리보기 캐시·보호된 배포 주소 문제(SH-P1-11).
 * - `window.location` 으로 링크를 만들지 않는다(현재 쿼리·개발 주소가 섞임 — SH-P1-10).
 * - 새 URL 을 만들지 않고 기존 상세 라우트만 쓴다.
 */
import { DIBAY_PRODUCTION_SITE_ORIGIN } from "@/lib/platform/capacitor-server-url";
import { DIBAY_APP_LANDING_PATH } from "@/lib/share/app-store-links";

const LOCALHOST_RE = /^(localhost|127\.0\.0\.1|\[::1\])$/i;

function normalizeOrigin(raw: string | undefined | null): string | null {
  const v = (raw ?? "").trim().replace(/\/+$/, "");
  if (!v) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== "https:") return null;
    if (LOCALHOST_RE.test(u.hostname)) return null;
    return u.origin;
  } catch {
    return null;
  }
}

/** 공유 링크 origin — 운영 주소만 (localhost·배포별 주소 금지) */
export function resolveShareSiteOrigin(): string {
  const explicit =
    typeof process !== "undefined" ? normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL) : null;
  return explicit ?? DIBAY_PRODUCTION_SITE_ORIGIN;
}

/**
 * 지금 실행 중인 화면이 운영 주소인가 — 아니면(로컬·과거 Preview 주소) 바깥 공유 칸을 숨긴다.
 * 로컬·Preview 도 운영 DB 를 보므로(§J-1) 개발 화면에서 만든 링크를 외부로 보내지 않는다.
 * 앱(원격 server.url)은 운영 주소에서 열리므로 true.
 */
export function isProductionShareContext(currentOrigin?: string | null): boolean {
  const here =
    currentOrigin ?? (typeof window !== "undefined" ? window.location.origin : null);
  if (!here) return false;
  const origin = normalizeOrigin(here);
  if (!origin) return false;
  return origin === resolveShareSiteOrigin() || origin === DIBAY_PRODUCTION_SITE_ORIGIN;
}

export type ShareTarget =
  | { kind: "app" }
  | { kind: "feed"; postId: string }
  | { kind: "market"; postId: string }
  | { kind: "store"; storeSlug: string }
  | { kind: "store_product"; storeSlug: string; productId: string }
  | { kind: "moim_invite"; token: string };

const FEED_UTM = {
  utm_source: "dibay_share",
  utm_medium: "community",
  utm_campaign: "post_share",
} as const;

function seg(v: string): string {
  return encodeURIComponent(v.trim());
}

/** 대상별 정규 경로 — 기존 라우트 (§D-2) */
export function buildSharePath(target: ShareTarget): string | null {
  switch (target.kind) {
    case "app":
      return DIBAY_APP_LANDING_PATH;
    case "feed":
      return target.postId.trim() ? `/community/posts/${seg(target.postId)}` : null;
    case "market":
      return target.postId.trim() ? `/post/${seg(target.postId)}` : null;
    case "store":
      return target.storeSlug.trim() ? `/stores/${seg(target.storeSlug)}` : null;
    case "store_product":
      return target.storeSlug.trim() && target.productId.trim()
        ? `/stores/${seg(target.storeSlug)}/p/${seg(target.productId)}`
        : null;
    case "moim_invite":
      return target.token.trim() ? `/moim/i/${seg(target.token)}` : null;
    default:
      return null;
  }
}

/** 공유 절대 주소. FEED 만 기존 UTM 유지(변경 없음). 만들 수 없으면 null. */
export function buildShareUrl(target: ShareTarget): string | null {
  const path = buildSharePath(target);
  if (!path) return null;
  const url = new URL(path, resolveShareSiteOrigin());
  if (target.kind === "feed") {
    for (const [k, v] of Object.entries(FEED_UTM)) url.searchParams.set(k, v);
  }
  return url.toString();
}
