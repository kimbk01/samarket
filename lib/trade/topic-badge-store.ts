"use client";

/**
 * P-6 (2026-10-27, Owner 승인 v3): 거래 주제 배지(이름 + 색, 아이콘 없음) 조회용 공용 저장소.
 * 목록 구성 맵이 이미 받은 카테고리 응답을 재사용하고, 없을 때만 한 번 받는다(기존 조회·캐시 정책 변경 없음).
 * 하위 카테고리는 ROOT 주제로 올려 배지를 고른다.
 */
import { useEffect, useSyncExternalStore } from "react";
import { getCategories } from "@/lib/categories/getCategories";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { resolveTradeCompositionRootRow } from "@/lib/trade/category-form/resolve-for-category";

export type TradeTopicBadgeInfo = { label: string; labelEn: string | null; color: string | null };

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

/** 목록 구성 맵(`useTradeListCompositionMap`)이 받은 카테고리 응답으로 배지 맵을 채운다 — 별도 요청·캐시 정책 없음 */
export function primeTradeTopicBadges(list: readonly CategoryWithSettings[]): void {
  if (list.length === 0) return;
  badgeMap = buildTradeTopicBadgeMap(list);
  for (const l of listeners) l();
}

/** 구성 맵을 쓰지 않는 화면(카테고리 목록 등) — 배지가 비어 있을 때만 한 번 받는다(동시 호출은 단일 비행) */
async function loadTradeTopicBadges(): Promise<void> {
  const list = await runSingleFlight("trade-topic-badges", () => getCategories({ type: "trade", activeOnly: true }));
  primeTradeTopicBadges(list);
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
    if (missing) void loadTradeTopicBadges();
  }, [missing]);
  const id = typeof categoryId === "string" ? categoryId.trim() : "";
  return id ? map.get(id) ?? null : null;
}
