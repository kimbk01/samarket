/**
 * B-10 — 샘플 매장(stores.store_kind='sample')에 연결된 배너에 샘플 표시.
 * 노출·클릭 집계는 DB 트리거(20270707130000)가 이미 기록하지 않는다 — 여기서는 고객 표시만.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export async function markSampleStoreBannerSlides<T extends { storeId?: string | null }>(
  sb: SupabaseClient,
  slides: readonly T[]
): Promise<Array<T & { isSampleStore: boolean }>> {
  const storeIds = [...new Set(slides.map((s) => String(s.storeId ?? "").trim()).filter(Boolean))];
  const sample = new Set<string>();
  if (storeIds.length) {
    const { data, error } = await sb.from("stores").select("id, store_kind").in("id", storeIds);
    if (!error) {
      for (const row of data ?? []) {
        const r = row as { id?: string; store_kind?: string | null };
        if (r.store_kind === "sample" && r.id) sample.add(String(r.id));
      }
    }
  }
  return slides.map((s) => ({ ...s, isSampleStore: sample.has(String(s.storeId ?? "")) }));
}
