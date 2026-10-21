"use client";

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { MyStateView, type MyScreenTemplate, type MyStateViewProps } from "@/components/mypage/ds/MyStateView";
import { dibayMyInfoPerfMark, dibayMyInfoPerfNavClick } from "@/lib/runtime/dibay-myinfo-perf";
import { useBottomNavOccupiesClearance } from "@/lib/layout/bottom-nav-scroll-chrome-context";
import { resolveMyStickyCtaBodyClearanceClass } from "@/lib/mypage/my-sticky-cta-placement";
import { MYPAGE_BODY_COLUMN_CLASS, MYPAGE_SCROLL_BODY_CLASS } from "@/lib/ui/mypage-responsive-breakpoints";

export type MyScreenProps = {
  title: string;
  backHref?: string;
  preferHistoryBack?: boolean;
  template: MyScreenTemplate;
  /** 지정하면 본문 대신 상태(스켈레톤/빈/오류)를 그린다. `template` 생략 시 화면 template 사용 */
  state?: MyStateViewProps;
  /** 하단 고정 CTA (`MyStickyCta`) — 본문 아래 여백 자동 확보 */
  stickyCta?: ReactNode;
  /** 헤더 오른쪽 아이콘 CTA (예: 게시판 검색, S61) */
  headerRight?: ReactNode;
  children?: ReactNode;
};

type MyInfoPerfWindow = Window & { __dibayMyInfoPerf?: { marks?: Record<string, unknown> } };

/** 헤더 뒤로 가로채기 — true 를 돌려주면 이동하지 않는다(미저장 확인 등, T3). */
type MyScreenBackGuard = () => boolean;

const MyScreenBackGuardContext = createContext<((guard: MyScreenBackGuard | null) => void) | null>(null);

/**
 * 하위 화면 본문이 헤더 [뒤로]를 가로챌 때 사용 (예: 탈퇴 사유·동의 입력 후 뒤로 → 미저장 확인, S19).
 * `guard` 가 true 를 돌려주면 이동하지 않는다. `MyScreen` 밖에서는 아무 동작도 하지 않는다.
 */
export function useMyScreenBackGuard(guard: MyScreenBackGuard | null): void {
  const register = useContext(MyScreenBackGuardContext);
  const guardRef = useRef(guard);
  useEffect(() => {
    guardRef.current = guard;
  });
  const active = guard != null;
  useEffect(() => {
    if (!register) return;
    if (!active) {
      register(null);
      return;
    }
    register(() => guardRef.current?.() ?? false);
    return () => register(null);
  }, [active, register]);
}

/**
 * 내정보 하위 화면 골격 (최종 설계 §1.2) — 헤더(`MySubpageHeader`) + 본문 1열(40rem·16/20px, §1.8)
 * + 상태 슬롯 + 하단 CTA 슬롯. `MyPageStackShell` 의 성능 마크(`dibayMyInfoPerfMark`)를 그대로 유지한다.
 */
export function MyScreen({
  title,
  backHref = "/mypage",
  preferHistoryBack = true,
  template,
  state,
  stickyCta,
  headerRight,
  children,
}: MyScreenProps) {
  const backGuardRef = useRef<MyScreenBackGuard | null>(null);
  const [hasBackGuard, setHasBackGuard] = useState(false);
  const registerBackGuard = useCallback((guard: MyScreenBackGuard | null) => {
    backGuardRef.current = guard;
    setHasBackGuard(guard != null);
  }, []);
  const interceptBack = useMemo(() => () => backGuardRef.current?.() ?? false, []);
  const bottomNavOccupies = useBottomNavOccupiesClearance();

  useEffect(() => {
    const s = (window as MyInfoPerfWindow).__dibayMyInfoPerf;
    if (!s?.marks?.route_start_ms) {
      dibayMyInfoPerfMark("route_start_ms", { surface: "mypage_stack", title });
    }
    if (!s?.marks?.first_shell_visible_ms) {
      dibayMyInfoPerfMark("first_shell_visible_ms", { surface: "mypage_stack" });
    }
  }, [title]);

  useEffect(() => {
    const handler = (ev: PointerEvent) => {
      const target = ev.target as HTMLElement | null;
      const a = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      const href = a?.getAttribute("href") ?? "";
      if (!href) return;
      if (!href.startsWith("/mypage") && !href.startsWith("/my")) return;
      dibayMyInfoPerfNavClick(href);
    };
    window.addEventListener("pointerdown", handler, { capture: true });
    return () => window.removeEventListener("pointerdown", handler, { capture: true });
  }, []);

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-sam-app" data-my-screen-template={template}>
      <MySubpageHeader
        title={title}
        backHref={backHref}
        preferHistoryBack={preferHistoryBack}
        leftSlot={
          hasBackGuard ? (
            <AppBackButton
              backHref={backHref}
              preferHistoryBack={preferHistoryBack}
              interceptBack={interceptBack}
              ariaLabelKey="nav_back"
            />
          ) : undefined
        }
        rightSlot={headerRight}
        hideCtaStrip
        showHubQuickActions
      />
      {/**
       * 본문 1열 — 폰 16px · 768px 이상 20px · 최대 640px (v3 §2). 거터는 `MYPAGE_BODY_COLUMN_CLASS` 한 번만:
       * 바깥 래퍼는 가로 여백 없음 (앱 피드 거터 10/8 위에 다시 더하던 이중 여백 26/24px 제거).
       */}
      <div className={MYPAGE_SCROLL_BODY_CLASS} data-my-screen-body>
        <div
          className={`${MYPAGE_BODY_COLUMN_CLASS} pt-3 ${
            stickyCta ? resolveMyStickyCtaBodyClearanceClass(bottomNavOccupies) : "pb-4"
          }`}
        >
          <MyScreenBackGuardContext.Provider value={registerBackGuard}>
            {state ? <MyStateView {...state} template={state.template ?? template} /> : children}
          </MyScreenBackGuardContext.Provider>
        </div>
      </div>
      {stickyCta}
    </div>
  );
}
