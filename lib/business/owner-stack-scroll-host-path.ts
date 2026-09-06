import { isStoresOwnerStackPath } from "@/lib/business/owner-stack-path";

/** 상품 등록·편집 — 본문/하단 액션 분리를 위해 scroll host 잠금에서 제외 */
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
 * basic-info·profile·orders 등 guarded 서브라우트 포함. (하단 5탭 숨김과 분리)
 */
export function resolveOwnerStackScrollHostPath(ownerPathNorm: string): boolean {
  return (
    isStoresOwnerStackPath(ownerPathNorm) &&
    !isOwnerStoreProductComposerPath(ownerPathNorm)
  );
}
