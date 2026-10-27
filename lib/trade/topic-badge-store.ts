"use client";

/**
 * P-6 (2026-10-27, Owner 승인 v3): 거래 주제 배지(이름 + 색, 아이콘 없음) 조회용 공용 저장소.
 * 거래 카테고리 목록은 한 번만 받는다(목록 구성 맵 `useTradeListCompositionMap` 과 같은 단일 비행).
 * 하위 카테고리는 ROOT 주제로 올려 배지를 고른다.
 */
import { useEffect, useSyncExternalStore } from "react";
import { getCategories } from "@/lib/categories/getCategories";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { resolveTradeCompositionRootRow } from "@/lib/trade/category-form/resolve-for-category";

export type TradeTopicBadgeInfo = { label: string; labelEn: string | null; color: string | null };

const TTL_MS = 5 * 60_000;
let cachedList: CategoryWithSettings[] | null = null;
let cachedAt = 0;
let badgeMap: ReadonlyMap<string, TradeTopicBadgeInfo> = new Map();
const listeners = new Set<() => void>();

export function buildTradeTopicBadgeMap(
  list: readonly CategoryWithSettings[]
): Map<string, TradeTopicBadgeInfo> {
  const byId = new Map<string, CategoryWithSettings>();
  for (const c of list) if (c.id) byId.set(c.id, c);
  const out = new Map<string, TradeTopicBadgeInfo>();
  for (const c of list) {
    if (!c.id) continue;
    const root = resolveTradeCompositionRootRow(c.id, byId) ?? c;
    out.set(c.id, { label: root.name, labelEn: root.name_en ?? null, color: root.badge_color ?? null });
  }
  return out;
}

/** 거래 카테고리 목록 — 화면 여러 곳이 같은 요청을 공유한다 */
export async function getTradeCategoriesShared(): Promise<CategoryWithSettings[]> {
  if (cachedList && Date.now() - cachedAt < TTL_MS) return cachedList;
  const list = await runSingleFlight("trade-categories:active", () =>
    getCategories({ type: "trade", activeOnly: true })
  );
  if (list.length > 0) {
    cachedList = list;
    cachedAt = Date.now();
    badgeMap = buildTradeTopicBadgeMap(list);
    for (const l of listeners) l();
  }
  return list;
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

const EMPTY: ReadonlyMap<string, TradeTopicBadgeInfo> = new Map();

export function useTradeTopicBadge(categoryId: string | null | undefined): TradeTopicBadgeInfo | null {
  const map = useSyncExternalStore(
    subscribe,
    () => badgeMap,
    () => EMPTY
  );
  const missing = map.size === 0;
  useEffect(() => {
    if (missing) void getTradeCategoriesShared();
  }, [missing]);
  const id = typeof categoryId === "string" ? categoryId.trim() : "";
  return id ? map.get(id) ?? null : null;
}
