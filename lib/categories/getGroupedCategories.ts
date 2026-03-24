"use client";

/**
 * 활성 카테고리를 type별로 그룹화하여 반환
 * 전체 서비스 화면 등에서 그룹별 렌더링용
 */
import { getActiveCategories } from "./getActiveCategories";
import type { CategoryWithSettings } from "./types";

export interface GroupedCategories {
  all: CategoryWithSettings[];
  trade: CategoryWithSettings[];
  service: CategoryWithSettings[];
  community: CategoryWithSettings[];
  feature: CategoryWithSettings[];
}

export async function getGroupedCategories(): Promise<GroupedCategories> {
  const all = await getActiveCategories();
  return {
    all,
    trade: all.filter((c) => c.type === "trade"),
    service: all.filter((c) => c.type === "service"),
    community: all.filter((c) => c.type === "community"),
    feature: all.filter((c) => c.type === "feature"),
  };
}
