import { loadImageFetchUrl, loadStoreProductThumbnailFetchUrl } from "@/lib/image/image-loader";

/**
 * 홈 카드 사진 주소 — 시안 R4 수정안 #12 (Owner 「수정안대로 진행」 2026-11-18).
 * 이전 D4-1(`?width=` 만 붙인 Storage 변환)은 Supabase 가 사진을 줄이지 않고 가운데 세로 띠만 잘라 원본 높이 그대로 보내
 * (실측 2560×1441 → 360×1441) 홈 칸에서 세로 7~38% 만 보이고 최대 1.61배 확대됐다(운영 FAIL). → 폐지.
 *  - 마켓·매장 메뉴 = 앱 사진 단일 기준(Image V2 `loadImageFetchUrl`) — 목록 화면과 같은 정사각 썸네일(.feed)
 *  - 정보 공유 = 16:10 칸이라 원본에서 16:10 맞춤 변환(가로·세로·cover 모두 지정 — 띠 잘림 없음)
 */

/** 홈 마켓 카드 칸 최대 표시 폭(px) — PC 6열 */
export const HOME_TRADE_CARD_DISPLAY_PX = 212;
/** 홈 매장 메뉴 칸 최대 표시 폭(px) — 매장 카드 4칸 */
export const HOME_STORE_MENU_DISPLAY_PX = 86;
/** 정보 공유 카드 사진 변환 크기 (16:10 · 태블릿 380px 칸 × 화면 배율 2 이상) */
export const HOME_POST_CARD_IMAGE = { width: 800, height: 500, quality: 75 } as const;

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

/** 마켓 카드 — 목록 화면과 같은 정사각 썸네일 (단일 기준) */
export function homeTradeCardImageSrc(raw: string | null | undefined): string {
  return loadImageFetchUrl({ kind: "feed", raw: raw ?? "", displayPx: HOME_TRADE_CARD_DISPLAY_PX }) ?? "";
}

/** 매장 메뉴 칸 — 배달 화면과 같은 매장 상품 썸네일 (단일 기준) */
export function homeStoreMenuImageSrc(raw: string | null | undefined): string {
  return loadStoreProductThumbnailFetchUrl(raw ?? "", HOME_STORE_MENU_DISPLAY_PX) ?? "";
}

/** 정보 공유 카드 — 자사 Storage 공개 원본만 16:10 맞춤 변환 · 그 밖(다른 호스트·질의 붙은 주소)은 그대로 */
export function homePostCardImageSrc(url: string | null | undefined, origin: string | null = supabaseOrigin()): string {
  const raw = String(url ?? "").trim();
  if (!raw || !origin) return raw;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return raw;
  }
  if (u.origin !== origin || u.search || !u.pathname.startsWith(OBJECT_PREFIX)) return raw;
  // 목록용 작은 사본(.thumb/.feed)이 오면 원본으로 되돌려 변환한다
  const path = u.pathname.slice(OBJECT_PREFIX.length).replace(/\.(thumb|feed)\.webp$/i, ".webp");
  const { width, height, quality } = HOME_POST_CARD_IMAGE;
  return `${u.origin}${RENDER_PREFIX}${path}?width=${width}&height=${height}&resize=cover&quality=${quality}`;
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
