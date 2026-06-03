"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useCallback, useLayoutEffect } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminTestSwitcher } from "@/components/admin/AdminTestSwitcher";
import { AdminNotificationBell } from "@/components/admin/order-notifications/AdminNotificationBell";
import { AdminShellToolbar } from "@/components/admin/AdminShellToolbar";
import { AdminStorePointPendingProvider } from "@/components/admin/store-points/AdminStorePointPendingProvider";
import { readSidebarExpanded } from "@/lib/admin-ui-prefs";

/** Shell 레이아웃·권한 불변 — 언어 토글(설정/프로필 서브그래프)만 별도 청크로 분리. */
const AdminLanguageToggleLazy = dynamic(
  () => import("@/components/admin/AdminLanguageToggle").then((m) => m.AdminLanguageToggle),
  { ssr: false }
);

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

function IconHamburger() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  useIsomorphicLayoutEffect(() => {
    setSidebarExpanded(readSidebarExpanded());
  }, []);

  const handleSidebarExpandedChange = useCallback((expanded: boolean) => {
    setSidebarExpanded(expanded);
  }, []);

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  return (
    <AdminStorePointPendingProvider>
      <div data-admin className="flex min-h-screen w-full min-w-0 max-w-full overflow-x-hidden bg-sam-app">
        {/* 모바일 backdrop — 사이드바 열렸을 때 뒤쪽 클릭으로 닫기 */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={closeMobile}
            aria-hidden="true"
          />
        )}

        {/* 사이드바: 데스크탑은 flex 참여 / 모바일은 fixed overlay */}
        <AdminSidebar
          desktopVisible={sidebarExpanded}
          isMobileOpen={mobileOpen}
          onClose={closeMobile}
        />

        <div className="flex min-w-0 max-w-full flex-1 flex-col overflow-x-hidden">
          <header className="sticky top-0 z-20 flex min-w-0 max-w-full shrink-0 items-center gap-2 overflow-x-hidden border-b border-sam-border bg-sam-surface px-3 py-2 sm:gap-3 sm:px-4">
            {/* 모바일 전용 햄버거 버튼 */}
            <button
              type="button"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface text-sam-fg hover:bg-sam-app lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label={t("admin_shell_sidebar_expand")}
            >
              <IconHamburger />
            </button>

            <h1 className="min-w-0 flex-1 truncate sam-text-page-title font-semibold text-sam-fg">
              {t("admin_brand")}
            </h1>

            <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1.5 border-l border-sam-border pl-3 sm:gap-2 sm:pl-4">
              <AdminShellToolbar
                sidebarExpanded={sidebarExpanded}
                onSidebarExpandedChange={handleSidebarExpandedChange}
              />
              <AdminLanguageToggleLazy />
              <AdminNotificationBell />
              <AdminTestSwitcher />
              <Link
                href="/philife"
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
    </AdminStorePointPendingProvider>
  );
}
