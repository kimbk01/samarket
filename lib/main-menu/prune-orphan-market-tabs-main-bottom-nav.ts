/**
 * admin_settings 의 main_bottom_nav 에서 `/market/…` 인데 거래 카테고리가 없는 행을 제거합니다.
 * (GET 오버레이만으로는 DB JSON 이 그대로라 관리자 화면·일부 경로와 어긋날 수 있어 저장소도 정리)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MainBottomNavAdminRow, MainBottomNavStoredPayload } from "@/lib/main-menu/main-bottom-nav-types";
import {
  getDefaultMainBottomNavAdminRows,
  mainBottomNavAdminRowToStoredItem,
  resolveMainBottomNavAdminRows,
  validateMainBottomNavPayload,
} from "@/lib/main-menu/resolve-main-bottom-nav";
import {
  loadActiveTradeMarketNameMapForHrefSegments,
  parseMarketHrefSegment,
  tradeMarketSegmentLookupKey,
} from "@/lib/main-menu/trade-market-bottom-nav-sync";

export async function pruneOrphanMarketTabsInMainBottomNavValueJson(
  sb: SupabaseClient,
  valueJson: unknown
): Promise<{ changed: boolean; payload: MainBottomNavStoredPayload; removed: number }> {
  const beforeRows = resolveMainBottomNavAdminRows(valueJson);
  const segmentList: string[] = [];
  for (const r of beforeRows) {
    const seg = parseMarketHrefSegment(r.href ?? "");
    if (seg) segmentList.push(seg);
  }
  const nameMap = await loadActiveTradeMarketNameMapForHrefSegments(sb, segmentList);

  let removed = 0;
  const kept: MainBottomNavAdminRow[] = [];
  for (const r of beforeRows) {
    const seg = parseMarketHrefSegment(r.href ?? "");
    if (!seg) {
      kept.push(r);
      continue;
    }
    if (!nameMap.has(tradeMarketSegmentLookupKey(seg))) {
      removed++;
      continue;
    }
    kept.push(r);
  }

  let finalRows = kept;
  const visible = finalRows.filter((x) => x.visible).length;
  if (visible < 1) {
    finalRows = getDefaultMainBottomNavAdminRows();
  }

  const validated = validateMainBottomNavPayload({
    items: finalRows.map(mainBottomNavAdminRowToStoredItem),
  });
  if (!validated.ok) {
    const fallback = validateMainBottomNavPayload({
      items: getDefaultMainBottomNavAdminRows().map(mainBottomNavAdminRowToStoredItem),
    });
    if (!fallback.ok) {
      throw new Error("main_bottom_nav_default_invalid");
    }
    return {
      changed: true,
      payload: fallback.payload,
      removed: beforeRows.length,
    };
  }

  const beforeSnap = JSON.stringify(
    beforeRows.map(mainBottomNavAdminRowToStoredItem).map((x) => [x.id, x.visible, x.href, x.label])
  );
  const afterSnap = JSON.stringify(
    validated.payload.items.map((x) => [x.id, x.visible, x.href, x.label])
  );
  const changed = beforeSnap !== afterSnap;

  return { changed, payload: validated.payload, removed };
}
