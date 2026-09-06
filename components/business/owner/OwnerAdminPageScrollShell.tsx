"use client";

import type { ReactNode, Ref } from "react";
import {
  OWNER_COMPACT_SHELL_BODY_SCROLL_CLASS,
  OWNER_MOBILE_BOTTOM_NAV_PAD_CLASS,
} from "@/lib/stores/owner-mobile-ui-tokens";

type Props = {
  children: ReactNode;
  /** false — basic-info 등 하단 5탭이 꺼진 화면 */
  padForOwnerBottomNav?: boolean;
  className?: string;
  /** Optional ref to the scroll host (`main.owner-compact-shell__scroll`). */
  scrollRef?: Ref<HTMLElement | null>;
};

/**
 * 매장 오너 compact 셸 서브화면 — body 스크롤 잠금 아래 내부 scroll 루트.
 * 허브 `OwnerOperationsDashboard` + `BusinessAdminDashboard` 와 동일 3단 flex.
 */
export function OwnerAdminPageScrollShell({
  children,
  padForOwnerBottomNav = true,
  className,
  scrollRef,
}: Props) {
  const scrollPadClass = padForOwnerBottomNav ? OWNER_MOBILE_BOTTOM_NAV_PAD_CLASS : "";
  const scrollClassName = [
    OWNER_COMPACT_SHELL_BODY_SCROLL_CLASS,
    "min-h-0 flex-1",
    scrollPadClass,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="relative flex min-h-0 w-full flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col">
        <main
          ref={scrollRef as Ref<HTMLElement>}
          className={scrollClassName}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
