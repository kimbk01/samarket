"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import {
  useSetMainTier1ExtrasOptional,
  type MainTier1Partial,
} from "@/contexts/MainTier1ExtrasContext";

/**
 * 페이지 자체 헤더 대신 전역 1단(`RegionBar` → `DetailHeader`)에 제목·부제·뒤로를 넘긴다 (크롬 S2 2026-11-02).
 * `tier1` 은 호출 측에서 `useMemo` 로 고정한다. `null` 이면 등록하지 않는다.
 * 등록 pathname 을 같이 기록해 전환 중 이전 화면 제목이 남지 않는다 (`mainTier1ExtrasForPathname`).
 */
export function useRegisterMainTier1Header(tier1: MainTier1Partial | null): void {
  const setMainTier1Extras = useSetMainTier1ExtrasOptional();
  const pathname = usePathname();

  useLayoutEffect(() => {
    if (!setMainTier1Extras || !tier1) return;
    setMainTier1Extras({ tier1, pathname: pathname ?? undefined });
    return () => setMainTier1Extras(null);
  }, [setMainTier1Extras, tier1, pathname]);
}
