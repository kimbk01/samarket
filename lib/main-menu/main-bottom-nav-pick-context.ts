import { resolveMainBottomNavSecondaryRailKind } from "@/lib/main-menu/main-bottom-nav-split-layout";

/** 하단 탭 활성·idle prefetch — `BottomNav` 링크와 동일한 레일·쿼리 컨텍스트 */
export type MainBottomNavPickContext = {
  searchParams?: { get: (key: string) => string | null } | null;
  ownerStoreId?: string | null;
};

export function resolveMainBottomNavPickTabActiveOptions(
  pathname: string | null,
  ctx?: MainBottomNavPickContext
): {
  searchParams: { get: (key: string) => string | null } | null;
  secondaryRail: ReturnType<typeof resolveMainBottomNavSecondaryRailKind>;
} {
  const searchParams = ctx?.searchParams ?? null;
  return {
    searchParams,
    secondaryRail: resolveMainBottomNavSecondaryRailKind(pathname, searchParams),
  };
}
