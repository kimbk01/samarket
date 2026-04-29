"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { usePathname } from "next/navigation";
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
  const tabs = useMemo(
    () => (initialNavItems && initialNavItems.length > 0 ? initialNavItems : BOTTOM_NAV_ITEMS),
    [initialNavItems]
  );

  const hostRef = useRef<HTMLDivElement>(null);
  const prevIdxRef = useRef<number | null>(null);
  const didHydrateNavRef = useRef(false);

  useLayoutEffect(() => {
    const idx = resolveActiveMainBottomNavTabIndex(pathname, tabs);
    const prev = prevIdxRef.current;
    prevIdxRef.current = idx;

    if (!didHydrateNavRef.current) {
      didHydrateNavRef.current = true;
      return;
    }

    const el = hostRef.current;
    if (!el) return;

    el.classList.remove(LTR, RTL);

    if (idx < 0 || prev === null || prev < 0 || idx === prev) {
      return;
    }

    const cls = idx > prev ? LTR : RTL;
    void el.offsetWidth;
    el.classList.add(cls);
  }, [pathname, tabs]);

  return (
    <div
      ref={hostRef}
      className={`${contentStretchClass} isolate overflow-x-hidden`}
      onAnimationEnd={(e) => {
        if (e.target !== e.currentTarget) return;
        hostRef.current?.classList.remove(LTR, RTL);
      }}
    >
      {children}
    </div>
  );
}
