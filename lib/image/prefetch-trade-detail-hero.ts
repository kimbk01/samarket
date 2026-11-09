import { imageResolveTradePostDetailDisplayUrl } from "@/lib/image/image-trade-detail";
import { addBounded } from "@/lib/collections/bounded-collections";

const inflight = new Set<string>();
/** 이미 데운 히어로 URL 상한 — 넘으면 오래된 것부터 잊는다(잊은 URL 은 다음 탭 때 브라우저 캐시로 다시 데울 뿐). */
const DONE_MAX = 300;
const done = new Set<string>();

/** 목록 tap/hover — 상세 1280 tier 히어로 warm (route prefetch 와 별도) */
export function prefetchTradePostDetailHeroImage(raw: string | null | undefined): void {
  if (typeof window === "undefined") return;
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return;
  const url = imageResolveTradePostDetailDisplayUrl(trimmed);
  if (!url || done.has(url) || inflight.has(url)) return;
  inflight.add(url);
  const img = new Image();
  const finish = () => {
    inflight.delete(url);
    addBounded(done, url, DONE_MAX);
  };
  img.onload = finish;
  img.onerror = finish;
  img.src = url;
}
