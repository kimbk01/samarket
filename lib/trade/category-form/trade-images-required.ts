import type { SupabaseClient } from "@supabase/supabase-js";
import { applyTradeBehaviorAdapter, type TradeBehaviorContext } from "./behavior-adapters";
import { loadResolvedTradeCompositionByCategoryId } from "./load-composition-for-filter";
import type { ResolvedTradeComposition } from "./types";

/**
 * 거래 I W-2 (2026-10-28) — 사진 필수 여부 단일 판정.
 * 주제 구성의 `images` 필드 required(중고거래·중고차·부동산·렌터카 true, 일자리·환전 false) + 행동 규칙
 * (중고차 「삽니다」는 false). 화면(`TradeWriteForm`)과 서버(`create`·`owner-trade-update`)가 같은 기준을 쓴다.
 */
export function tradeCompositionImagesRequired(
  composition: ResolvedTradeComposition,
  ctx: TradeBehaviorContext
): boolean {
  const field = applyTradeBehaviorAdapter(composition, ctx).find((f) => f.id === "images");
  return Boolean(field && field.visible && field.effectiveRequired);
}

/** 서버 — 글의 거래 카테고리·meta 로 판정. 구성을 못 읽으면 false(막지 않음) */
export async function isTradeImagesRequiredServer(
  sb: SupabaseClient<any>,
  tradeCategoryId: string | null | undefined,
  meta: Record<string, unknown> | null | undefined
): Promise<boolean> {
  const composition = await loadResolvedTradeCompositionByCategoryId(sb, tradeCategoryId);
  if (!composition) return false;
  const carTradeRaw = String(meta?.car_trade ?? "").trim().toLowerCase();
  const carTrade = carTradeRaw === "buy" ? "buy" : carTradeRaw === "sell" ? "sell" : null;
  return tradeCompositionImagesRequired(composition, { carTrade });
}
