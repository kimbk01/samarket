"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { usePathname } from "next/navigation";
import { CommunityMessengerHomeShellSkeleton } from "@/components/community-messenger/CommunityMessengerRouteSkeletons";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { useLatestMenuNavigation } from "@/contexts/LatestMenuNavigationContext";
import { BOTTOM_NAV_ITEMS, type BottomNavItemConfig } from "@/lib/main-menu/bottom-nav-config";
import { resolveActiveMainBottomNavTabIndex } from "@/lib/main-menu/main-bottom-nav-prefetch-pick";

const LTR = "main-shell-tab-enter-ltr";
const RTL = "main-shell-tab-enter-rtl";

type Props = {
  children: React.ReactNode;
  initialNavItems?: BottomNavItemConfig[] | null;
  /** `ConditionalAppShell` 채팅 상세 등에서 본문 컬럼과 동일한 flex 연장 */
  contentStretchClass?: string;
};

export function MainShellTabContentTransition({
  children,
  initialNavItems = null,
  contentStretchClass = "min-w-0",
}: Props) {
  const pathname = usePathname();
  const { isPendingMenuBlockingContent, pendingMenuShellKind, pendingMenuIntent } = useLatestMenuNavigation();
  const tabs = useMemo(
    () => (initialNavItems && initialNavItems.length > 0 ? initialNavItems : BOTTOM_NAV_ITEMS),
    [initialNavItems]
  );
  /**
   * 하단 탭은 `beginMenuNavigation` 직후 RSC 완료 전까지 스켈레톤을 전면에 올리면
   * “탭이 안 먹는다” 체감이 크다. 슬라이드만 두고 본문은 바로 그린다.
   */
  const blockMainShellWithPendingOverlay =
    isPendingMenuBlockingContent && pendingMenuIntent?.source !== "bottom-nav";

  const pendingShell = useMemo(() => {
    if (!blockMainShellWithPendingOverlay) return null;
    if (pendingMenuShellKind === "messenger") {
      return <CommunityMessengerHomeShellSkeleton />;
    }
    return <MainFeedRouteLoading rows={5} />;
  }, [blockMainShellWithPendingOverlay, pendingMenuShellKind]);

  const hostRef = useRef<HTMLDivElement>(null);
  const prevIdxRef = useRef<number | null>(null);
  const didHydrateNavRef = useRef(false);
  /** intent 해제 리렌더 시 애니메이션 클래스가 벗겨지지 않도록 — 실제 경로 변경 시에만 슬라이드 적용 */
  const prevPathnameForSlideRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const pathKey = pathname ?? "";
    const idx = resolveActiveMainBottomNavTabIndex(pathname, tabs);

    if (!didHydrateNavRef.current) {
      didHydrateNavRef.current = true;
      prevPathnameForSlideRef.current = pathKey;
      prevIdxRef.current = idx;
      return;
    }

    const pathChanged = prevPathnameForSlideRef.current !== pathKey;
    prevPathnameForSlideRef.current = pathKey;

    const prev = prevIdxRef.current;
    prevIdxRef.current = idx;

    if (!pathChanged) {
      return;
    }

    const el = hostRef.current;
    if (!el) return;

    el.classList.remove(LTR, RTL);

    const switchedTab = idx >= 0 && prev !== null && prev >= 0 && idx !== prev;
    if (!switchedTab) {
      return;
    }

    /**
     * 하단 탭: 우측 탭=ltr(좌→우 덮음), 좌측 탭=rtl(우→좌 덮음). 그 외는 인덱스 증감으로 추정.
     */
    let cls: typeof LTR | typeof RTL;
    const slide = pendingMenuIntent?.mainShellTabSlide;
    if (slide && pendingMenuIntent?.source === "bottom-nav") {
      cls = slide === "ltr" ? LTR : RTL;
    } else {
      cls = idx > prev ? LTR : RTL;
    }

    void el.offsetWidth;
    el.classList.add(cls);
    // pendingMenuIntent 는 pathname 이 바뀐 그 커밋에서만 읽음 — deps 에 넣으면 intent 해제 시 본 이펙트가 불필요하게 재실행됨
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 의도적: 탭 슬라이드 방향은 경로 변경 프레임의 intent 만 사용
  }, [pathname, tabs]);

  return (
    <div
      ref={hostRef}
      className={`${contentStretchClass} relative isolate overflow-x-hidden`}
      onAnimationEnd={(e) => {
        if (e.target !== e.currentTarget) return;
        hostRef.current?.classList.remove(LTR, RTL);
      }}
    >
      {children}
      {pendingShell ? (
        <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden bg-sam-app">
          {pendingShell}
        </div>
      ) : null}
    </div>
  );
}
