"use client";

import type { ReactNode } from "react";
import { MainTier1ExtrasProvider } from "@/contexts/MainTier1ExtrasContext";

/** `(main)` 레이아웃 — 전역 1단(`RegionBar`)과 페이지가 `MainTier1Extras`로 2행·CTA를 공유 */
export function MainTier1ChromeProvider({ children }: { children: ReactNode }) {
  return <MainTier1ExtrasProvider>{children}</MainTier1ExtrasProvider>;
}
