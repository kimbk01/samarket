"use client";

import { usePathname } from "next/navigation";
import { normalizeAppPathnameForTier1 } from "@/lib/layout/normalize-app-pathname";

/** `/write` 단일 시트·`/write/[slug]` 레거시 — 전역 `RegionBar` 대신 인플로 1단 */
export function useWriteScreenEmbeddedTier1(): boolean {
  const pathname = usePathname();
  const p = normalizeAppPathnameForTier1(pathname);
  return p === "/write" || p.startsWith("/write/");
}
