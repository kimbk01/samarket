import type { MutableRefObject } from "react";
import {
  resolveCanonicalNavIndex,
  shouldSuppressMessengerRoomMainShellSlide,
  type RouteTransitionEnterKind,
} from "@/components/route-transition/route-transition-config";
import type { CanonicalNavIndexResolver } from "@/lib/main-menu/canonical-nav-index-resolver";

function normalizePathKey(path: string | null | undefined): string {
  return String(path ?? "").split("?")[0]?.trim() ?? "";
}

function isMypageStoreSectionPath(path: string | null | undefined): boolean {
  const p = normalizePathKey(path);
  return p === "/mypage/section/store" || p.startsWith("/mypage/section/store/");
}

/** `/stores/owner` 허브 및 하위 운영 경로 — 신청(`/stores/owner/apply`)은 제외 */
function isStoresOwnerStackPath(path: string | null | undefined): boolean {
  const p = normalizePathKey(path);
  if (p === "/stores/owner") return true;
  if (p.startsWith("/stores/owner/")) {
    if (p === "/stores/owner/apply" || p.startsWith("/stores/owner/apply/")) return false;
    return true;
  }
  return false;
}

function storesOwnerStackDepth(path: string | null | undefined): number {
  const p = normalizePathKey(path);
  if (!isStoresOwnerStackPath(p)) return -1;
  if (p === "/stores/owner") return 0;
  const rest = p.slice("/stores/owner".length).replace(/^\//, "");
  if (!rest) return 0;
  return rest.split("/").filter(Boolean).length;
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
  if (kind === "ltr-back" || kind === "rtl-back") {
    ref.current = null;
  }
}

export function computeRouteTransitionEnterKind(
  prevPath: string,
  nextPath: string,
  opts: {
    popstateBack: boolean;
    lastForwardAxisRef: MutableRefObject<"ltr" | "rtl" | null>;
    /**
     * 동적 인덱스 resolver — admin(`/admin/menus/main-bottom-nav`)에서 변경한 5탭(+ `custom_*`)
     * **현재 순서**를 기반으로 인덱스를 계산한다. 미지정 시 정적 fallback(`resolveCanonicalNavIndex`).
     */
    resolveIndex?: CanonicalNavIndexResolver;
  }
): RouteTransitionEnterKind {
  const resolveIndex: CanonicalNavIndexResolver = opts.resolveIndex ?? resolveCanonicalNavIndex;
  let kind: RouteTransitionEnterKind;

  if (prevPath === nextPath) {
    kind = "none";
  } else if (shouldSuppressMessengerRoomMainShellSlide(prevPath, nextPath)) {
    kind = "none";
  } else if (isStoresOwnerStackPath(prevPath) && !isStoresOwnerStackPath(nextPath)) {
    /** 매장 운영 스택에서 탭 밖으로 나갈 때 — 좌→우 퇴장 */
    kind = "ltr-back";
  } else if (isStoresOwnerStackPath(nextPath)) {
    /** 매장 운영 스택 진입·내부 이동 — 우→좌, 뒤로(popstate)는 좌→우 */
    if (opts.popstateBack) {
      kind = "ltr-back";
    } else if (!isStoresOwnerStackPath(prevPath)) {
      kind = "rtl-forward";
      opts.lastForwardAxisRef.current = "rtl";
    } else {
      const dPrev = storesOwnerStackDepth(prevPath);
      const dNext = storesOwnerStackDepth(nextPath);
      if (dNext > dPrev) {
        kind = "rtl-forward";
        opts.lastForwardAxisRef.current = "rtl";
      } else if (dNext < dPrev) {
        kind = "ltr-back";
      } else {
        kind = "rtl-forward";
        opts.lastForwardAxisRef.current = "rtl";
      }
    }
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
       * 활성보다 **오른쪽** 메뉴 선택 → 새 페이지가 화면 **왼쪽 밖**에서 들어와 오른쪽으로(좌→우) 덮음.
       * 사용자 의도: "오른쪽 메뉴 선택시 새 화면이 왼쪽에서 들어옴".
       */
      kind = "ltr-forward";
    } else {
      /**
       * 활성보다 **왼쪽** 메뉴 선택 → 새 페이지가 화면 **오른쪽 밖**에서 들어와 왼쪽으로(우→좌) 덮음.
       * 사용자 의도: "좌측 메뉴 선택시 새 화면이 오른쪽에서 밀고 들어옴".
       */
      kind = "rtl-forward";
    }
  }

  syncLastForwardAxisAfterKind(kind, opts.lastForwardAxisRef);
  return kind;
}
