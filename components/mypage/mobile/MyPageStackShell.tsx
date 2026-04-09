"use client";

import type { ReactNode } from "react";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { APP_MAIN_COLUMN_CLASS } from "@/lib/ui/app-content-layout";

export function MyPageStackShell({
  title,
  backHref,
  notificationUnreadCount,
  children,
}: {
  title: string;
  backHref: string;
  notificationUnreadCount?: number | null;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MySubpageHeader
        title={title}
        backHref={backHref}
        preferHistoryBack
        hideCtaStrip
        showHubQuickActions
        notificationUnreadCount={notificationUnreadCount}
      />
      <div className={`${APP_MAIN_COLUMN_CLASS} flex-1 pb-12 pt-1`}>{children}</div>
    </div>
  );
}
