import { imageResolveTradePostDetailDisplayUrl } from "@/lib/image/image-trade-detail";

const inflight = new Set<string>();
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
    done.add(url);
  };
  img.onload = finish;
  img.onerror = finish;
  img.src = url;
}
