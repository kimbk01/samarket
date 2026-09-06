import { isStoresOwnerStackPath } from "@/lib/business/owner-stack-path";

/** 상품 등록·편집 — 헤더 분기·BottomNav 숨김·전용 높이/스크롤 대상 */
export function isOwnerStoreProductComposerPath(pathname: string): boolean {
  const p = pathname.split("?")[0]?.replace(/\/+$/, "") ?? "";
  return (
    p === "/stores/owner/products/new" ||
    /^\/stores\/owner\/products\/[^/]+\/edit$/.test(p) ||
    p === "/my/business/products/new" ||
    /^\/my\/business\/products\/[^/]+\/edit$/.test(p)
  );
}

/**
 * compact 오너 스택 — body 스크롤 잠금 + `.owner-compact-shell__scroll` 단일 스크롤.
 * Product composer는 제외 — RECOVERED_GOOD (`ad7942be6`) 전용 높이/스크롤 소유.
 */
export function resolveOwnerStackScrollHostPath(ownerPathNorm: string): boolean {
  return (
    isStoresOwnerStackPath(ownerPathNorm) &&
    !isOwnerStoreProductComposerPath(ownerPathNorm)
  );
}
