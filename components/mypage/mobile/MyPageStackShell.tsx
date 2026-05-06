"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";
import { dibayMyInfoPerfMark, dibayMyInfoPerfNavClick } from "@/lib/runtime/dibay-myinfo-perf";

export function MyPageStackShell({
  title,
  backHref,
  children,
}: {
  title: string;
  backHref: string;
  children: ReactNode;
}) {
  useEffect(() => {
    // Prevent duplicate marks in the same navigation run.
    const s = (window as any).__dibayMyInfoPerf;
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
    return () => window.removeEventListener("pointerdown", handler, { capture: true } as any);
  }, []);

  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-sam-app">
      <MySubpageHeader
        title={title}
        backHref={backHref}
        preferHistoryBack
        hideCtaStrip
        showHubQuickActions
      />
      <div className={APP_MAIN_TAB_SCROLL_BODY_CLASS}>{children}</div>
    </div>
  );
}
