import type { MutableRefObject } from "react";
import {
  resolveCanonicalNavIndex,
  shouldSuppressMessengerRoomMainShellSlide,
  shouldSuppressOwnerStackMainShellSlide,
  type RouteTransitionEnterKind,
} from "@/components/route-transition/route-transition-config";
import type { CanonicalNavIndexResolver } from "@/lib/main-menu/canonical-nav-index-resolver";
import {
  isStoresOwnerStackPath,
  storesOwnerStackDepth,
} from "@/lib/business/owner-stack-path";
import { isProfileEditPath } from "@/lib/mypage/mypage-mobile-nav-registry";
import {
  isMypageAddressEditPath,
  isMypageAddressListPath,
  isMypageAddressSearchPath,
} from "@/lib/addresses/mypage-addresses-return-to";
import {
  isMarketplaceSellerHubPath,
  marketplaceSellerHubDepth,
} from "@/lib/trade/marketplace/marketplace-seller-hub-slide";

function normalizePathKey(path: string | null | undefined): string {
  return String(path ?? "").split("?")[0]?.trim() ?? "";
}

function isMypageStoreSectionPath(path: string | null | undefined): boolean {
  const p = normalizePathKey(path);
  return p === "/mypage/section/store" || p.startsWith("/mypage/section/store/");
}

function isMypagePath(path: string | null | undefined): boolean {
  const p = normalizePathKey(path);
  return p === "/mypage" || p.startsWith("/mypage/") || p === "/my" || p.startsWith("/my/");
}

function isMypageRootPath(path: string | null | undefined): boolean {
  const p = normalizePathKey(path);
  return p === "/mypage" || p === "/my";
}

function isProfileEditRoute(path: string | null | undefined): boolean {
  const p = normalizePathKey(path);
  return isProfileEditPath(p);
}

function isAddressPlatformRoute(path: string | null | undefined): boolean {
  return isMypageAddressListPath(path) || isMypageAddressSearchPath(path) || isMypageAddressEditPath(path);
}

function addressPlatformDepth(path: string | null | undefined): number {
  if (isMypageAddressEditPath(path)) return 2;
  if (isMypageAddressSearchPath(path)) return 1;
  if (isMypageAddressListPath(path)) return 0;
  return -1;
}

function isStoreOwnerApplyPath(path: string | null | undefined): boolean {
  const p = normalizePathKey(path);
  return p === "/stores/owner/apply" || p.startsWith("/stores/owner/apply/");
}

function syncLastForwardAxisAfterKind(
  kind: RouteTransitionEnterKind,
  ref: MutableRefObject<"ltr" | "rtl" | null>
): void {
  if (kind === "ltr-forward") {
    ref.current = "ltr";
    return;
  }
  if (kind === "rtl-forward") {
    ref.current = "rtl";
    return;
  }
  if (kind === "ltr-back" || kind === "rtl-back" || kind === "store-apply-back") {
    ref.current = null;
    return;
  }
  if (kind === "store-apply-forward") {
    ref.current = "rtl";
  }
  if (kind === "profile-edit-forward") {
    ref.current = "rtl";
  }
  if (kind === "profile-edit-back") {
    ref.current = null;
  }
  if (kind === "address-platform-forward") {
    ref.current = "rtl";
  }
  if (kind === "address-platform-back") {
    ref.current = null;
  }
}

type RouteTransitionOpts = {
  popstateBack: boolean;
  lastForwardAxisRef: MutableRefObject<"ltr" | "rtl" | null>;
  resolveIndex?: CanonicalNavIndexResolver;
};

/** `OwnerStackPageSlideShell` — 스택 내부 270ms 슬라이드 방향 */
export function computeStoresOwnerStackTransitionKind(
  prevPath: string,
  nextPath: string,
  opts: Pick<RouteTransitionOpts, "popstateBack" | "lastForwardAxisRef">
): RouteTransitionEnterKind {
  if (prevPath === nextPath) return "none";
  if (isStoresOwnerStackPath(prevPath) && !isStoresOwnerStackPath(nextPath)) {
    return "ltr-back";
  }
  if (!isStoresOwnerStackPath(nextPath)) return "none";

  if (opts.popstateBack) return "ltr-back";
  if (!isStoresOwnerStackPath(prevPath)) {
    opts.lastForwardAxisRef.current = "rtl";
    return "rtl-forward";
  }
  const dPrev = storesOwnerStackDepth(prevPath);
  const dNext = storesOwnerStackDepth(nextPath);
  if (dNext > dPrev) {
    opts.lastForwardAxisRef.current = "rtl";
    return "rtl-forward";
  }
  if (dNext < dPrev) return "ltr-back";
  opts.lastForwardAxisRef.current = "rtl";
  return "rtl-forward";
}

export function computeRouteTransitionEnterKind(
  prevPath: string,
  nextPath: string,
  opts: RouteTransitionOpts
): RouteTransitionEnterKind {
  const resolveIndex: CanonicalNavIndexResolver = opts.resolveIndex ?? resolveCanonicalNavIndex;
  let kind: RouteTransitionEnterKind;

  if (prevPath === nextPath) {
    kind = "none";
  } else if (shouldSuppressMessengerRoomMainShellSlide(prevPath, nextPath)) {
    kind = "none";
  } else if (shouldSuppressOwnerStackMainShellSlide(prevPath, nextPath)) {
    kind = "none";
    const stackKind = computeStoresOwnerStackTransitionKind(prevPath, nextPath, opts);
    syncLastForwardAxisAfterKind(stackKind, opts.lastForwardAxisRef);
    return kind;
  } else if (isStoreOwnerApplyPath(nextPath) && isMypagePath(prevPath)) {
    kind = "store-apply-forward";
  } else if (isStoreOwnerApplyPath(prevPath) && isMypagePath(nextPath)) {
    kind = "store-apply-back";
  } else if (isProfileEditRoute(nextPath) && isMypagePath(prevPath) && !isProfileEditRoute(prevPath)) {
    kind = "profile-edit-forward";
  } else if (isMypageRootPath(nextPath) && isProfileEditRoute(prevPath)) {
    kind = "profile-edit-back";
  } else if (isAddressPlatformRoute(nextPath) && !isAddressPlatformRoute(prevPath)) {
    kind = "address-platform-forward";
  } else if (isAddressPlatformRoute(prevPath) && !isAddressPlatformRoute(nextPath)) {
    kind = "address-platform-back";
  } else if (isAddressPlatformRoute(prevPath) && isAddressPlatformRoute(nextPath)) {
    const dPrev = addressPlatformDepth(prevPath);
    const dNext = addressPlatformDepth(nextPath);
    if (dNext > dPrev) kind = "address-platform-forward";
    else if (dNext < dPrev) kind = "address-platform-back";
    else kind = "subtle";
  } else if (isMarketplaceSellerHubPath(prevPath) || isMarketplaceSellerHubPath(nextPath)) {
    const dPrev = marketplaceSellerHubDepth(prevPath);
    const dNext = marketplaceSellerHubDepth(nextPath);
    if (dPrev >= 0 && dNext >= 0) {
      if (opts.popstateBack) {
        kind = dNext < dPrev ? "ltr-back" : "rtl-back";
      } else if (dNext > dPrev) {
        kind = "rtl-forward";
        opts.lastForwardAxisRef.current = "rtl";
      } else if (dNext < dPrev) {
        kind = "ltr-back";
      } else {
        kind = "subtle";
      }
    } else if (dNext >= 0 && dPrev < 0) {
      kind = "rtl-forward";
      opts.lastForwardAxisRef.current = "rtl";
    } else if (dPrev >= 0 && dNext < 0) {
      kind = "ltr-back";
    } else {
      kind = "none";
    }
  } else if (isStoresOwnerStackPath(prevPath) && !isStoresOwnerStackPath(nextPath)) {
    /** 매장 운영 스택에서 탭 밖으로 나갈 때 — 좌→우 퇴장 */
    kind = "ltr-back";
  } else if (isStoresOwnerStackPath(nextPath)) {
    kind = computeStoresOwnerStackTransitionKind(prevPath, nextPath, opts);
  } else if (opts.popstateBack && isMypageStoreSectionPath(prevPath)) {
    /**
     * `/mypage/section/store` 트리: 뒤로가기는 항상 좌→우.
     * - popstate back 에서 "previous page enters from left" 체감(ltr-back)을 고정한다.
     */
    kind = "ltr-back";
  } else if (isMypageStoreSectionPath(nextPath)) {
    /**
     * `/mypage/section/store` 트리: 진입/내부 이동은 항상 우→좌.
     * - 배달 전용 내정보/주문/주소 등은 iOS push 처럼 보여야 한다.
     */
    kind = "rtl-forward";
    // forward axis 를 명시해 이후 popstate back 방향도 안정적으로 맞춘다.
    opts.lastForwardAxisRef.current = "rtl";
  } else {
    const ixPrev = resolveIndex(prevPath);
    const ixNext = resolveIndex(nextPath);

    if (ixPrev === null || ixNext === null) {
      kind = "none";
    } else if (ixPrev === ixNext) {
      kind = "subtle";
    } else if (opts.popstateBack) {
      const axis = opts.lastForwardAxisRef.current;
      if (axis === "ltr") kind = "rtl-back";
      else if (axis === "rtl") kind = "ltr-back";
      else kind = ixNext > ixPrev ? "rtl-back" : "ltr-back";
    } else if (ixNext > ixPrev) {
      /**
       * 활성보다 **오른쪽** 메뉴 선택 → 새 페이지가 화면 **오른쪽 밖**에서 들어와 왼쪽으로(우→좌) 덮음.
       * 첫 탭(커뮤니티)에서 오른쪽으로 이동할 때 항상 같은 축.
       */
      kind = "rtl-forward";
    } else {
      /**
       * 활성보다 **왼쪽** 메뉴 선택 → 새 페이지가 화면 **왼쪽 밖**에서 들어와 오른쪽으로(좌→우) 덮음.
       * 마지막 탭(내정보)에서 왼쪽으로 이동할 때 항상 같은 축.
       */
      kind = "ltr-forward";
    }
  }

  syncLastForwardAxisAfterKind(kind, opts.lastForwardAxisRef);
  return kind;
}
