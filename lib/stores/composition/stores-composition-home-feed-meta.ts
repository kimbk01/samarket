/**
 * C8 — Attach resolved HOME composition policy to home-feed API meta (fresh each response).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  StoresHomeCompositionPolicyMeta,
  StoresHomePopularityOverlayMeta,
} from "@/lib/stores/composition/stores-composition-live";
import {
  listCompositionPolicyOverrides,
  type StoresCompositionPolicyOverrideDbRow,
} from "@/lib/stores/composition/stores-composition-policy-db";
import { resolveRuntimeCompositionPolicyFromDbRows } from "@/lib/stores/composition/stores-composition-policy-runtime";
import {
  homeShelfDbRowsToOverrides,
  type HomeShelfProductDbRow,
} from "@/lib/stores/product/stores-home-shelf-product-db";
import {
  resolveHomeShelfProductCatalog,
  type StoresHomeShelfResolvedConfig,
} from "@/lib/stores/product/stores-home-shelf-product-resolve";

export type StoresHomeShelfProductMeta = {
  shelves: StoresHomeShelfResolvedConfig[];
};

/** 구성 정책(C3)과 선반 상품 필드를 한 번에 읽는 열 — 두 용도의 합집합 */
const HOME_POLICY_COMBINED_SELECT =
  "surface, slot, shelf_id, enabled, section_order, max_items, interval_consumed, interval_every_n, updated_at, title_ko, title_en, subtitle_ko, subtitle_en, presentation_mode, coupon_integration, ad_integration, schedule_start, schedule_end, product_config";

type HomePolicyCombinedRow = StoresCompositionPolicyOverrideDbRow & HomeShelfProductDbRow;

function isMissingTable(err: { message?: string; code?: string }): boolean {
  const m = (err.message ?? "").toLowerCase();
  return err.code === "42P01" || m.includes("does not exist");
}

export type HomeFeedCompositionPolicyMeta = StoresHomeCompositionPolicyMeta & {
  shelfProduct: StoresHomeShelfProductMeta;
};

/**
 * 묶음4 F-02 — `store_composition_policy_overrides`(surface=home) 를 요청당 **1회** 읽어
 * 구성 정책·선반 상품·삽입(insertion) 메타가 같은 결과를 공유한다.
 * 선반 열이 없는 구 스키마(`title_ko` 오류)만 기존처럼 정책 행만 읽고 선반은 비운다.
 */
export async function loadHomeFeedCompositionPolicyMeta(
  sb: SupabaseClient
): Promise<HomeFeedCompositionPolicyMeta | null> {
  let policyRows: StoresCompositionPolicyOverrideDbRow[];
  let shelfRows: HomeShelfProductDbRow[];
  const { data, error } = await sb
    .from("store_composition_policy_overrides")
    .select(HOME_POLICY_COMBINED_SELECT)
    .eq("surface", "home");
  if (error) {
    /** 선반 열 없음(42703 undefined_column) 판정이 먼저 — 그 문구도 "does not exist" 를 포함한다 */
    if (error.code === "42703" || (error.message ?? "").includes("title_ko")) {
      policyRows = await listCompositionPolicyOverrides(sb, "home");
      shelfRows = [];
    } else if (isMissingTable(error)) {
      policyRows = [];
      shelfRows = [];
    } else {
      throw new Error(error.message);
    }
  } else {
    const rows = (data ?? []) as unknown as HomePolicyCombinedRow[];
    policyRows = rows;
    shelfRows = rows;
  }
  const bundle = resolveRuntimeCompositionPolicyFromDbRows("home", policyRows);
  const shelves = resolveHomeShelfProductCatalog(homeShelfDbRowsToOverrides(shelfRows));
  return {
    rows: bundle.rows,
    overrideCount: bundle.overrideCount,
    rejectedOverrideSlots: bundle.rejectedOverrideSlots,
    engine: "live",
    shelfProduct: { shelves },
  };
}

export function attachHomeFeedCompositionPolicyMeta<T extends { meta?: Record<string, unknown> }>(
  payload: T,
  compositionPolicy: StoresHomeCompositionPolicyMeta | null
): T {
  if (!compositionPolicy) return payload;
  const overlay = (payload.meta as { popularityOverlay?: StoresHomePopularityOverlayMeta } | undefined)
    ?.popularityOverlay;
  return {
    ...payload,
    meta: {
      ...(payload.meta ?? {}),
      compositionPolicy: overlay
        ? { ...compositionPolicy, popularityOverlay: overlay }
        : compositionPolicy,
      compositionEngine: "live" as const,
    },
  };
}
