/**
 * 매장 홍보 자리 수 (광고 DB 묶음 C-DB SA-03 · 2026-11-27).
 *
 * 최대 수 = 고객 화면이 실제로 끼우는 최대 수와 **같은 함수**:
 *  - 배달 홈(`STORES_HOME_FEED`) = `homePaidAdInsertionPolicyMax`(고객 홈 삽입과 같음 · 정책 없음 = 5)
 *  - 업종 목록(`STORES_CATEGORY_FEED`) = `resolveBrowseScopePolicy(...).maxInsertion`(고객 업종 삽입과 같음 · null = 제한 없음)
 * 점유 수 = DB 함수 `delivery_ad_sponsored_slots_used` 하나 — 제출 함수(`owner_submit_delivery_ad_with_business_cash_v2`)가
 * 같은 함수로 잠근 뒤 세어 넘치면 `capacity_full`(차감 없음). 사장님 화면 「남은 자리」도 같은 함수(`..._slots_used_for`).
 * 조회 오류는 던진다 — 제출은 「확인 못 함」(503)으로 팔지 않는다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadRuntimeCompositionPolicy } from "@/lib/stores/composition/stores-composition-policy-runtime";
import { homePaidAdInsertionPolicyMax } from "@/lib/stores/composition/stores-composition-insertion-live";
import { listBrowseScopePolicyRows, mapBrowseScopeDbRow } from "@/lib/stores/product/stores-browse-scope-policy-db";
import { resolveBrowseScopePolicy } from "@/lib/stores/product/stores-browse-scope-policy-catalog";
import { STORES_HOME_FEED_INVENTORY_KEY } from "@/lib/stores/advertising/delivery-ad-home-feed-sell-gate";

export const STORES_CATEGORY_FEED_CAPACITY_KEY = "STORES_CATEGORY_FEED" as const;
export const DELIVERY_AD_SPONSORED_SLOTS_USED_FOR_RPC = "delivery_ad_sponsored_slots_used_for" as const;

/** 지면 최대 수 — null = 제한 없음 (고객 삽입도 자르지 않음) */
export async function resolveStoreSponsoredCapacityMax(
  sb: SupabaseClient,
  input: {
    inventoryKey: string;
    /** 업종 목록만: 대상 대분류·소분류 (비면 매장 업종 — 호출자가 채운다) */
    browseTargetKind?: "primary" | "secondary" | null;
    primarySlug?: string | null;
    secondarySlug?: string | null;
  }
): Promise<number | null> {
  if (input.inventoryKey === STORES_HOME_FEED_INVENTORY_KEY) {
    const policy = await loadRuntimeCompositionPolicy(sb, "home");
    return homePaidAdInsertionPolicyMax(policy.rows);
  }
  if (input.inventoryKey === STORES_CATEGORY_FEED_CAPACITY_KEY) {
    const primary = String(input.primarySlug ?? "").trim().toLowerCase();
    if (!primary) return null;
    const secondary =
      input.browseTargetKind === "secondary" ? String(input.secondarySlug ?? "").trim().toLowerCase() || null : null;
    const mapped = (await listBrowseScopePolicyRows(sb)).map(mapBrowseScopeDbRow);
    const byScope = new Map(mapped.map((r) => [r.scopeKey, r]));
    const resolved = resolveBrowseScopePolicy({
      primarySlug: primary,
      subSlug: secondary,
      primaryRow: byScope.get(primary) ?? null,
      subRow: secondary ? byScope.get(`${primary}/${secondary}`) ?? null : null,
    });
    return resolved.maxInsertion;
  }
  return null;
}

/** 사장님 신청 화면 「남은 자리」 — 아직 신청서가 없을 때 이 기간에 같은 지면 점유 수 (조회 오류는 던진다) */
export async function loadStoreSponsoredSlotsUsed(
  sb: SupabaseClient,
  input: {
    storeId: string;
    inventoryKey: string;
    browseTargetKind: "primary" | "secondary" | null;
    startAtIso: string;
    endAtIso: string;
  }
): Promise<number> {
  const { data, error } = await sb.rpc(DELIVERY_AD_SPONSORED_SLOTS_USED_FOR_RPC, {
    p_store_id: input.storeId,
    p_inventory_key: input.inventoryKey,
    p_target_kind: input.browseTargetKind,
    p_start: input.startAtIso,
    p_end: input.endAtIso,
  });
  if (error) throw new Error(error.message || "slots_used_failed");
  return Math.max(0, Math.trunc(Number(data) || 0));
}
