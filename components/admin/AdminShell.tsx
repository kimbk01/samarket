"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminTestSwitcher } from "@/components/admin/AdminTestSwitcher";
import { AdminNotificationBell } from "@/components/admin/order-notifications/AdminNotificationBell";
import { AdminShellToolbar } from "@/components/admin/AdminShellToolbar";
import { readSidebarExpanded } from "@/lib/admin-ui-prefs";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const [sidebarExpanded, setSidebarExpanded] = useState(true);

  useEffect(() => {
    setSidebarExpanded(readSidebarExpanded());
  }, []);

  return (
    <div data-admin className="flex min-h-screen w-full min-w-0 max-w-full overflow-x-hidden bg-sam-app">
      {sidebarExpanded && <AdminSidebar />}
      <div className="flex min-w-0 max-w-full flex-1 flex-col overflow-x-hidden">
        <header className="sticky top-0 z-20 flex min-w-0 max-w-full shrink-0 items-center gap-3 overflow-x-hidden border-b border-sam-border bg-sam-surface px-4 py-2">
          <h1 className="min-w-0 flex-1 truncate sam-text-page-title font-semibold text-sam-fg">
            {t("admin_brand")}
          </h1>
          <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1.5 border-l border-sam-border pl-3 sm:gap-2 sm:pl-4">
            <AdminShellToolbar
              sidebarExpanded={sidebarExpanded}
              onSidebarExpandedChange={setSidebarExpanded}
            />
            <AdminNotificationBell />
            <AdminTestSwitcher />
            <Link
              href="/home"
              className="sam-btn sam-btn--outline sam-btn--sm"
            >
              {t("common_homepage")}
            </Link>
          </div>
        </header>
        <main className="min-h-0 w-full min-w-0 flex-1 px-4 py-4">
          {children}
        </main>
      </div>
    </div>
  );
}
