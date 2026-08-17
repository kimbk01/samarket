"use client";

/**
 * Home / favorites / related list — resolve category composition for PostCard (R5 overlay).
 * Category list feed already has category in scope; mixed feeds need this map.
 */
import { useEffect, useMemo, useState } from "react";
import { getCategories } from "@/lib/categories/getCategories";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { resolveTradeCompositionRootRow } from "@/lib/trade/category-form/resolve-for-category";
import { resolveTradeWriteSkinKey } from "@/lib/trade/resolve-trade-write-skin-key";

export type TradeListCompositionProps = {
  skinKey: string;
  categorySlug: string | null;
  fieldComposition: unknown | null;
};

function propsFromCategory(c: CategoryWithSettings): TradeListCompositionProps {
  return {
    skinKey: resolveTradeWriteSkinKey(c.icon_key),
    categorySlug: c.slug ?? null,
    fieldComposition: c.settings?.field_composition ?? null,
  };
}

/** Child category ids resolve to ROOT topic composition (CUT A1). */
export function buildTradeListCompositionMapFromCategories(
  list: readonly CategoryWithSettings[]
): Map<string, TradeListCompositionProps> {
  const byRow = new Map<string, CategoryWithSettings>();
  for (const c of list) {
    if (!c.id) continue;
    byRow.set(c.id, c);
  }
  const next = new Map<string, TradeListCompositionProps>();
  for (const c of list) {
    if (!c.id) continue;
    const root = resolveTradeCompositionRootRow(c.id, byRow) ?? c;
    next.set(c.id, propsFromCategory(root));
  }
  return next;
}

export function useTradeListCompositionMap(): {
  ready: boolean;
  propsForCategoryId: (categoryId: string | null | undefined) => TradeListCompositionProps | null;
} {
  const [byId, setById] = useState<Map<string, TradeListCompositionProps>>(() => new Map());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getCategories({ type: "trade", activeOnly: true }).then((list) => {
      if (cancelled) return;
      setById(buildTradeListCompositionMapFromCategories(list));
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const propsForCategoryId = useMemo(() => {
    return (categoryId: string | null | undefined): TradeListCompositionProps | null => {
      const id = typeof categoryId === "string" ? categoryId.trim() : "";
      if (!id) return null;
      return byId.get(id) ?? null;
    };
  }, [byId]);

  return { ready, propsForCategoryId };
}
