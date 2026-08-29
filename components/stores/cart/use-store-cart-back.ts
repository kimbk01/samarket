"use client";

import { useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useStoreCartAnimatedBack } from "@/components/stores/cart/StoreCartSwipeBackShell";
import { runStoreCartBackNavigation } from "@/lib/stores/store-cart-back-navigation";

/** 장바구니 헤더·기타 뒤로 — Dibay resolver via thin cart adapter */
export function useStoreCartBack(
  storeSlug: string,
  opts?: {
    overlayOpen?: boolean;
    onCloseOverlay?: () => void;
  }
): () => void {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const animatedBack = useStoreCartAnimatedBack();

  return useCallback(() => {
    runStoreCartBackNavigation(router, storeSlug, {
      overlayOpen: opts?.overlayOpen,
      onCloseOverlay: opts?.onCloseOverlay,
      pathname,
      search: typeof window !== "undefined" ? window.location.search : "",
      animatedBack,
    });
  }, [animatedBack, opts?.onCloseOverlay, opts?.overlayOpen, pathname, router, storeSlug]);
}
