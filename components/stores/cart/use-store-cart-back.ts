"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useStoreCartAnimatedBack } from "@/components/stores/cart/StoreCartSwipeBackShell";
import { runStoreCartBackNavigation } from "@/lib/stores/store-cart-back-navigation";

/** 장바구니 헤더·기타 뒤로 — 스와이프 셸 애니메이션 또는 즉시 history back */
export function useStoreCartBack(storeSlug: string): () => void {
  const router = useRouter();
  const animatedBack = useStoreCartAnimatedBack();

  return useCallback(() => {
    if (animatedBack) {
      animatedBack();
      return;
    }
    runStoreCartBackNavigation(router, storeSlug);
  }, [animatedBack, router, storeSlug]);
}
