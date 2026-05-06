import type { MutableRefObject } from "react";
import {
  resolveCanonicalNavIndex,
  shouldSuppressMessengerRoomMainShellSlide,
  type RouteTransitionEnterKind,
} from "@/components/route-transition/route-transition-config";

function normalizePathKey(path: string | null | undefined): string {
  return String(path ?? "").split("?")[0]?.trim() ?? "";
}

function isMypageStoreSectionPath(path: string | null | undefined): boolean {
  const p = normalizePathKey(path);
  return p === "/mypage/section/store" || p.startsWith("/mypage/section/store/");
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
  }
): RouteTransitionEnterKind {
  let kind: RouteTransitionEnterKind;

  if (prevPath === nextPath) {
    kind = "none";
  } else if (shouldSuppressMessengerRoomMainShellSlide(prevPath, nextPath)) {
    kind = "none";
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
    const ixPrev = resolveCanonicalNavIndex(prevPath);
    const ixNext = resolveCanonicalNavIndex(nextPath);

    if (ixPrev === null || ixNext === null) {
      kind = "none";
    } else if (ixPrev === ixNext) {
      kind = "subtle";
    } else if (opts.popstateBack) {
      const axis = opts.lastForwardAxisRef.current;
      if (axis === "ltr") kind = "rtl-back";
      else if (axis === "rtl") kind = "ltr-back";
      else kind = ixNext > ixPrev ? "ltr-back" : "rtl-back";
    } else if (ixNext > ixPrev) {
      kind = "ltr-forward";
    } else {
      kind = "rtl-forward";
    }
  }

  syncLastForwardAxisAfterKind(kind, opts.lastForwardAxisRef);
  return kind;
}
