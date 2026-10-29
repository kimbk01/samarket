/**
 * WP7 — 메뉴 상세 → 매장 복귀 실행(브라우저). 결정 규칙은 `resolveProductDetailReturnAction` (순수 함수).
 * - back: 새 기록 없이 매장으로 → 매장 화면 원래 스크롤 위치 복원
 * - replace: 메뉴 상세 기록을 매장으로 바꿈 (딥링크·목록에서 바로 들어온 경우)
 */
import { readNavigationEntryContext } from "@/lib/navigation/dibay-navigation-context-store";
import {
  hasNavigationApiHistory,
  readPreviousInAppHistoryHref,
} from "@/lib/navigation/fixed-destination-back";
import {
  resolveProductDetailReturnAction,
  type ProductDetailReturnAction,
} from "@/lib/stores/store-menu-detail-cart-baemin-presentation";

type ReturnRouter = {
  back: () => void;
  replace: (href: string, options?: { scroll?: boolean }) => void;
};

export function decideReturnFromProductDetailToStore(storeSlug: string): ProductDetailReturnAction {
  if (typeof window === "undefined") return "replace";
  return resolveProductDetailReturnAction({
    storeSlug,
    hasNavigationApi: hasNavigationApiHistory(),
    previousHref: readPreviousInAppHistoryHref(),
    historyIncludesStoreParent: readNavigationEntryContext(storeSlug)?.historyIncludesStoreParent === true,
  });
}

/**
 * @param replaceHref replace 일 때 이동할 주소 (기본: 매장 메뉴 화면)
 * @param beforeBack back 직전에 실행 (매장 화면이 읽을 1회 의도 표시 등)
 */
export function returnFromProductDetailToStore(
  router: ReturnRouter,
  storeSlug: string,
  opts?: { replaceHref?: string; beforeBack?: () => void; beforeReplace?: () => void }
): ProductDetailReturnAction {
  const action = decideReturnFromProductDetailToStore(storeSlug);
  if (action === "back") {
    opts?.beforeBack?.();
    router.back();
    return action;
  }
  opts?.beforeReplace?.();
  router.replace(opts?.replaceHref ?? `/stores/${encodeURIComponent(storeSlug)}`, { scroll: false });
  return action;
}
