"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminTestSwitcher } from "@/components/admin/AdminTestSwitcher";
import { AdminNotificationBell } from "@/components/admin/order-notifications/AdminNotificationBell";
import { AdminShellToolbar } from "@/components/admin/AdminShellToolbar";
import { readSidebarExpanded } from "@/lib/admin-ui-prefs";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [sidebarExpanded, setSidebarExpanded] = useState(true);

  useEffect(() => {
    setSidebarExpanded(readSidebarExpanded());
  }, []);

  return (
    <div data-admin className="flex min-h-screen w-full min-w-0 max-w-full overflow-x-hidden bg-gray-100">
      {sidebarExpanded && <AdminSidebar />}
      <div className="flex min-w-0 max-w-full flex-1 flex-col overflow-x-hidden">
        <header className="sticky top-0 z-20 flex min-w-0 max-w-full shrink-0 items-center gap-3 overflow-x-hidden border-b border-gray-200 bg-white px-3 py-2 md:px-4">
          <h1 className="min-w-0 flex-1 truncate text-[18px] font-semibold text-gray-900">
            samarket 관리자
          </h1>
          <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1.5 border-l border-gray-200 pl-3 sm:gap-2 sm:pl-4">
            <AdminShellToolbar
              sidebarExpanded={sidebarExpanded}
              onSidebarExpandedChange={setSidebarExpanded}
            />
            <AdminNotificationBell />
            <AdminTestSwitcher />
            <Link
              href="/home"
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[13px] font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300"
            >
              홈페이지
            </Link>
          </div>
        </header>
        <main className="min-h-0 w-full min-w-0 flex-1 px-3 py-4 md:px-4 md:py-4">
          {children}
        </main>
      </div>
    </div>
  );
}
