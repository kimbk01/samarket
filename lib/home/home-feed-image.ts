/**
 * 설계 D4-1 (Owner 「승인·사진 받기 제외」 2026-11-18 · docs/audit/app-entry-device-fail-root-cause-design-2026-11-17.md §16-2):
 * 홈 카드 그림은 자사 Storage 크기 변환 주소로 받는다 — 원본(실측 133KB WebP)을 220px 카드에 그대로 받아 첫 화면 뒤 늦게 떴다.
 * `/storage/v1/object/public/…` → `/storage/v1/render/image/public/…?width=W&quality=70` (실측 width=480 → 49.6KB).
 * 자사 Storage 공개 주소가 아니거나 이미 질의가 붙은 주소는 그대로 둔다.
 */

export const HOME_FEED_IMAGE_WIDTH = { big: 720, pair: 360 } as const;
const OBJECT_PREFIX = "/storage/v1/object/public/";
const RENDER_PREFIX = "/storage/v1/render/image/public/";

function supabaseOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

export function homeFeedImageSrc(url: string, width: number, origin: string | null = supabaseOrigin()): string {
  const raw = String(url ?? "").trim();
  if (!raw || !origin) return raw;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return raw;
  }
  if (u.origin !== origin || u.search || !u.pathname.startsWith(OBJECT_PREFIX)) return raw;
  const w = Math.max(1, Math.round(width));
  return `${u.origin}${RENDER_PREFIX}${u.pathname.slice(OBJECT_PREFIX.length)}?width=${w}&quality=70`;
}

/**
 * 설계 D4-2: 다음 실행에 먼저 고를 카드 그림을 한가할 때 미리 받아 둔다(HTTP 캐시). 화면·해제와 무관 — 실패해도 무시.
 */
export function prefetchHomeFeedImages(urls: readonly string[]): void {
  if (typeof window === "undefined" || urls.length === 0) return;
  const run = () => {
    for (const src of urls) {
      if (!src) continue;
      try {
        const img = new Image();
        img.decoding = "async";
        (img as HTMLImageElement & { fetchPriority?: string }).fetchPriority = "low";
        img.src = src;
      } catch {
        /* ignore */
      }
    }
  };
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
  if (typeof ric === "function") ric(run);
}
