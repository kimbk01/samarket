import { STORE_DETAIL_HEADER_BAR_PX } from "@/lib/ui/store-detail-viewport-tuning";

let cachedHeaderOffsetPx: number | null = null;
let cachedHeaderOffsetAtMs = 0;

function readSafeAreaTopPx(): number {
  if (typeof document === "undefined") return 0;
  const tag = "di" + "v";
  const probe = document.createElement(tag);
  probe.style.cssText =
    "position:fixed;top:0;left:0;width:0;height:0;padding-top:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none";
  document.documentElement.appendChild(probe);
  const top = probe.getBoundingClientRect().height;
  probe.remove();
  return Math.max(0, Math.round(top));
}

function readVisualViewportOffsetTopPx(): number {
  if (typeof window === "undefined" || !window.visualViewport) return 0;
  return Math.min(80, Math.max(0, Math.round(window.visualViewport.offsetTop)));
}

export function readStoreDetailFixedHeaderOffsetPx(): number {
  return readSafeAreaTopPx() + STORE_DETAIL_HEADER_BAR_PX + readVisualViewportOffsetTopPx();
}

export function readStoreDetailFixedHeaderOffsetPxCached(): number {
  if (typeof performance === "undefined") {
    return readStoreDetailFixedHeaderOffsetPx();
  }
  const now = performance.now();
  if (cachedHeaderOffsetPx != null && now - cachedHeaderOffsetAtMs < 200) {
    return cachedHeaderOffsetPx;
  }
  const next = readStoreDetailFixedHeaderOffsetPx();
  cachedHeaderOffsetPx = next;
  cachedHeaderOffsetAtMs = now;
  return next;
}

export function invalidateStoreDetailViewportMetricsCache(): void {
  cachedHeaderOffsetPx = null;
  cachedHeaderOffsetAtMs = 0;
}
