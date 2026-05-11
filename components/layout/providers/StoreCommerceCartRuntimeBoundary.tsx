"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { StoreCommerceCartProvider } from "@/contexts/StoreCommerceCartContext";

/**
 * 장바구니 컨텍스트는 `/stores`·`/mypage` 에서만 마운트한다.
 * 모듈을 `MainAppProviderTree` 와 분리해 (main) 공통 그래프의 정적 import 무게를 줄인다.
 */
export function StoreCommerceCartRuntimeBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const mountCart = pathname.startsWith("/stores") || pathname.startsWith("/mypage");
  if (!mountCart) {
    return <>{children}</>;
  }
  return <StoreCommerceCartProvider>{children}</StoreCommerceCartProvider>;
}
