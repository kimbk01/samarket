"use client";

/**
 * Home / favorites list — resolve category composition for PostCard (R5 overlay).
 * Category list feed already has category in scope; mixed feeds need this map.
 */
import { useEffect, useMemo, useState } from "react";
import { getCategories } from "@/lib/categories/getCategories";
import type { CategoryWithSettings } from "@/lib/categories/types";
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
      const next = new Map<string, TradeListCompositionProps>();
      for (const c of list) {
        if (!c.id) continue;
        next.set(c.id, propsFromCategory(c));
      }
      setById(next);
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
