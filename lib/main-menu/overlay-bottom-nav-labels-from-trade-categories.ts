/**
 * 하단 탭 항목 중 `/market/{id|slug}` 는 거래 카테고리와 연결됩니다.
 * - DB에 없거나(삭제)·비활성(`is_active`)인 카테고리를 가리키면 **탭에서 제외**합니다.
 * - 유효하면 `categories.name`으로 라벨을 맞춥니다 (`/admin/menus/trade` 와 동기화).
 * (표시는 BottomNav 가 labelKey 우선이므로 덮어쓸 때 labelKey 를 제거합니다.)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BottomNavItemConfig } from "@/lib/main-menu/bottom-nav-config";
import {
  loadActiveTradeMarketNameMapForHrefSegments,
  parseMarketHrefSegment,
  tradeMarketSegmentLookupKey,
} from "@/lib/main-menu/trade-market-bottom-nav-sync";

export async function overlayBottomNavLabelsFromTradeCategories(
  sb: SupabaseClient,
  items: BottomNavItemConfig[]
): Promise<BottomNavItemConfig[]> {
  const segments = new Set<string>();
  for (const it of items) {
    const seg = parseMarketHrefSegment(it.href ?? "");
    if (seg) segments.add(tradeMarketSegmentLookupKey(seg));
  }
  if (segments.size === 0) return items;

  const nameBySegment = await loadActiveTradeMarketNameMapForHrefSegments(sb, segments);

  const out: BottomNavItemConfig[] = [];
  for (const it of items) {
    const seg = parseMarketHrefSegment(it.href ?? "");
    if (!seg) {
      out.push(it);
      continue;
    }
    const nm = nameBySegment.get(tradeMarketSegmentLookupKey(seg));
    if (!nm) {
      continue;
    }
    out.push({ ...it, label: nm, labelKey: undefined });
  }
  return out;
}
