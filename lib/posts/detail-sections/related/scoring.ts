import type { PostWithMeta } from "@/lib/posts/schema";
import type { ServiceSegment } from "../types";

function priceBandScore(anchorPrice: number | null, pPrice: number | null, pct: number): number {
  if (anchorPrice == null || pPrice == null || anchorPrice <= 0) return 0;
  const lo = anchorPrice * (1 - pct);
  const hi = anchorPrice * (1 + pct);
  if (pPrice >= lo && pPrice <= hi) return 10;
  return 0;
}

/** 제목 토큰 유사 — 매우 단순(공통 단어 비율) */
function titleTokenScore(a: string, b: string): number {
  const aw = a.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  const bw = new Set(b.toLowerCase().split(/\s+/).filter((w) => w.length > 1));
  if (aw.length === 0) return 0;
  let hit = 0;
  for (const w of aw) {
    if (bw.has(w)) hit++;
  }
  return Math.min(15, Math.round((hit / aw.length) * 15));
}

export function scoreRelatedItem(
  anchor: PostWithMeta,
  candidate: PostWithMeta,
  segment: ServiceSegment
): number {
  let s = 0;
  const ac = anchor.category_id ?? (anchor as unknown as { trade_category_id?: string }).trade_category_id;
  const cc = candidate.category_id ?? (candidate as unknown as { trade_category_id?: string }).trade_category_id;
  if (ac && cc && String(ac) === String(cc)) s += 40;

  if (anchor.region && candidate.region && anchor.region === candidate.region) s += 15;
  if (anchor.city && candidate.city && anchor.city === candidate.city) s += 8;

  const am = (anchor.meta ?? {}) as Record<string, unknown>;
  const cm = (candidate.meta ?? {}) as Record<string, unknown>;

  switch (segment) {
    case "used":
      s += priceBandScore(anchor.price ?? null, candidate.price ?? null, 0.3);
      s += titleTokenScore(anchor.title ?? "", candidate.title ?? "");
      break;
    case "car":
      s += priceBandScore(anchor.price ?? null, candidate.price ?? null, 0.18);
      if (am.car_model && cm.car_model && String(am.car_model) === String(cm.car_model)) s += 35;
      if (am.car_year && cm.car_year) {
        const ay = Number(am.car_year);
        const cy = Number(cm.car_year);
        if (Number.isFinite(ay) && Number.isFinite(cy) && Math.abs(ay - cy) <= 2) s += 25;
      }
      break;
    case "real_estate":
      if (am.deal_type && cm.deal_type && String(am.deal_type) === String(cm.deal_type)) s += 30;
      if (am.estate_type && cm.estate_type && String(am.estate_type) === String(cm.estate_type)) s += 25;
      s += priceBandScore(anchor.price ?? null, candidate.price ?? null, 0.35);
      break;
    case "exchange":
      if (
        am.from_currency &&
        cm.from_currency &&
        am.to_currency &&
        cm.to_currency &&
        String(am.from_currency) === String(cm.from_currency) &&
        String(am.to_currency) === String(cm.to_currency)
      ) {
        s += 50;
      }
      s += priceBandScore(anchor.price ?? null, candidate.price ?? null, 0.25);
      break;
    case "job":
      if (am.job_type && cm.job_type && String(am.job_type) === String(cm.job_type)) s += 28;
      if (am.work_category && cm.work_category && String(am.work_category) === String(cm.work_category)) s += 22;
      s += priceBandScore(anchor.price ?? null, candidate.price ?? null, 0.4);
      break;
    default:
      s += priceBandScore(anchor.price ?? null, candidate.price ?? null, 0.3);
  }

  return s;
}
