/**
 * 하단 탭 `href` 중 `/market/{id|slug}` ↔ 거래 카테고리 조회 공통.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const MARKET_HREF_SEG_RE = /^\/market\/([^/?#]+)\/?$/i;
export const TRADE_MARKET_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseMarketHrefSegment(href: string): string | null {
  const t = href.trim();
  const m = t.match(MARKET_HREF_SEG_RE);
  if (!m?.[1]) return null;
  try {
    return decodeURIComponent(m[1]).normalize("NFC");
  } catch {
    return m[1];
  }
}

export function tradeMarketSegmentLookupKey(seg: string): string {
  return TRADE_MARKET_UUID_RE.test(seg) ? seg.toLowerCase() : seg;
}

/** 활성 거래 카테고리: id·slug 룩업 키 → 표시명 */
export async function loadActiveTradeMarketNameMapForHrefSegments(
  sb: SupabaseClient,
  rawSegments: Iterable<string>
): Promise<Map<string, string>> {
  const normalized = new Set<string>();
  for (const s of rawSegments) {
    const t = tradeMarketSegmentLookupKey(s);
    if (t) normalized.add(t);
  }
  if (normalized.size === 0) return new Map();

  const segs = [...normalized];
  const idCandidates = segs.filter((s) => TRADE_MARKET_UUID_RE.test(s));
  const slugCandidates = segs.filter((s) => !TRADE_MARKET_UUID_RE.test(s));

  const rows: Array<{ id: string; name: unknown; slug: unknown; is_active: unknown }> = [];

  if (idCandidates.length > 0) {
    const { data, error } = await sb
      .from("categories")
      .select("id,name,slug,is_active")
      .eq("type", "trade")
      .in("id", idCandidates);
    if (!error && data?.length) rows.push(...(data as typeof rows));
  }

  if (slugCandidates.length > 0) {
    const { data, error } = await sb
      .from("categories")
      .select("id,name,slug,is_active")
      .eq("type", "trade")
      .in("slug", slugCandidates);
    if (!error && data?.length) rows.push(...(data as typeof rows));
  }

  const nameByKey = new Map<string, string>();
  for (const row of rows) {
    if (!row?.id || row.is_active === false) continue;
    if (typeof row.name !== "string" || !row.name.trim()) continue;
    const nm = row.name.trim();
    nameByKey.set(tradeMarketSegmentLookupKey(row.id), nm);
    if (typeof row.slug === "string" && row.slug.trim()) {
      nameByKey.set(row.slug.trim().normalize("NFC"), nm);
    }
  }
  return nameByKey;
}
