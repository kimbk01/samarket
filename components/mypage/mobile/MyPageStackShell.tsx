"use client";

import type { ReactNode } from "react";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";

export function MyPageStackShell({
  title,
  backHref,
  children,
}: {
  title: string;
  backHref: string;
  children: ReactNode;
}) {
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
