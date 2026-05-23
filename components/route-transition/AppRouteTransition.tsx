"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  ROUTE_TRANSITION_ENTER_CLASSES,
  routeTransitionClassForKind,
  type RouteTransitionEnterKind,
} from "@/components/route-transition/route-transition-config";
import { useRouteTransitionKindRef } from "@/components/route-transition/useRouteTransitionDirection";

type Props = {
  children: ReactNode;
  overlay?: ReactNode;
  /** `ConditionalAppShell` 채팅 상세 등에서 본문 컬럼과 동일한 flex 연장 */
  contentStretchClass?: string;
};

function stripTransitionClasses(el: HTMLDivElement | null) {
  if (!el) return;
  for (const c of ROUTE_TRANSITION_ENTER_CLASSES) {
    el.classList.remove(c);
  }
}

export function AppRouteTransition({ children, overlay, contentStretchClass = "min-w-0" }: Props) {
  const pathname = usePathname();
  const kindRef = useRouteTransitionKindRef(pathname);
  const hostRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    stripTransitionClasses(el);
    try {
      el.getAnimations().forEach((a) => a.cancel());
    } catch {
      /* ignore */
    }

    const kind: RouteTransitionEnterKind = kindRef.current;
    /**
     * 디버그 노출 — DevTools 에서 `data-route-transition-kind` 로 어떤 방향이 결정됐는지 확인 가능.
     * 5탭(/philife · /market · /stores · /community-messenger · /mypage) 어디서든 값이 비면
     * canonical 매핑이 누락된 것이므로 `route-transition-config.ts` 를 봐야 한다.
     */
    el.dataset.routeTransitionKind = kind;
    const cls = routeTransitionClassForKind(kind);
    if (!cls) {
      return;
    }

    /** reflow 후 raf 1프레임 미루어 transform from 값이 첫 paint 에 잡히도록 한다. */
    void el.offsetWidth;
    const raf = requestAnimationFrame(() => {
      hostRef.current?.classList.add(cls);
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- kindRef: pathname 과 같은 커밋에서 useRouteTransitionKindRef 가 갱신
  }, [pathname]);

  return (
    <div
      ref={hostRef}
      className={`${contentStretchClass} relative isolate overflow-x-clip`}
      onAnimationEnd={(e) => {
        if (e.target !== e.currentTarget) return;
        stripTransitionClasses(hostRef.current);
      }}
    >
      {children}
      {overlay ? (
        <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden bg-sam-app">{overlay}</div>
      ) : null}
    </div>
  );
}
