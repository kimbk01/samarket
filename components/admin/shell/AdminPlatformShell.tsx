"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminShellToolbar } from "@/components/admin/AdminShellToolbar";
import { AdminTestSwitcher } from "@/components/admin/AdminTestSwitcher";
import { AdminNotificationBell } from "@/components/admin/order-notifications/AdminNotificationBell";
import { AdminStorePointPendingProvider } from "@/components/admin/store-points/AdminStorePointPendingProvider";
import { AdminShellProvider, useAdminShell } from "@/components/admin/AdminShellContext";
import { AdminWorkspaceNav } from "@/components/admin/shell/AdminWorkspaceNav";
import { AdminWorkspaceSidebar } from "@/components/admin/shell/AdminWorkspaceSidebar";
import { AdminShellBreadcrumb } from "@/components/admin/shell/AdminShellBreadcrumb";
import { AdminDeliveryCmsRightMenu } from "@/components/admin/shell/AdminDeliveryCmsRightMenu";
import {
  listAdminWorkspaces,
  resolveActiveWorkspace,
  resolveAdminBreadcrumb,
} from "@/lib/admin/admin-workspace-routing";
import { isDeliveryCmsSurface } from "@/lib/admin/delivery-cms-nav";
import { readSidebarExpanded } from "@/lib/admin-ui-prefs";
import { getAdminRole } from "@/lib/admin-permission";
import type { AdminRole } from "@/lib/admin-menu-config";
import type { AdminMenuRole } from "@/components/admin/admin-menu";

const AdminLanguageToggleLazy = dynamic(
  () => import("@/components/admin/AdminLanguageToggle").then((m) => m.AdminLanguageToggle),
  { ssr: false }
);

/** Same host + DibayPopupAd as (main) ConditionalAppShell — no Admin-only popup renderer. */
const GlobalPopupHostLazy = dynamic(
  () => import("@/components/platform-popup/GlobalPopupHost").then((m) => m.GlobalPopupHost),
  { ssr: false }
);

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

function toMenuRole(role: AdminRole): AdminMenuRole {
  if (role === "manager") return "admin";
  if (role === "operator") return "operator";
  return "master";
}

function resolveMenuRole(
  uiRole: AdminRole | undefined,
  _adminMeLoading: boolean
): AdminMenuRole | null {
  if (uiRole) return toMenuRole(uiRole);
  const snapshotRole = getAdminRole();
  return snapshotRole ? toMenuRole(snapshotRole) : null;
}

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

function AdminPlatformShellInner({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const { adminMe, adminMeLoading, effectiveNavPath, setPendingNavPath } = useAdminShell();
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const headerRef = useRef<HTMLElement | null>(null);

  useIsomorphicLayoutEffect(() => {
    setSidebarExpanded(readSidebarExpanded());
  }, []);

  useIsomorphicLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const sync = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      if (h > 0) {
        el.style.setProperty("--admin-shell-header-height", `${h}px`);
        document.documentElement.style.setProperty("--admin-shell-header-height", `${h}px`);
      }
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const menuRole = useMemo(
    () => resolveMenuRole(adminMe?.uiRole, adminMeLoading),
    [adminMe?.uiRole, adminMeLoading]
  );
  const resolvedMenuRole = menuRole ?? "operator";

  const workspaces = useMemo(() => listAdminWorkspaces(resolvedMenuRole), [resolvedMenuRole]);
  const activeWorkspace = useMemo(
    () => resolveActiveWorkspace(effectiveNavPath, resolvedMenuRole),
    [effectiveNavPath, resolvedMenuRole]
  );
  const crumbs = useMemo(
    () => resolveAdminBreadcrumb(effectiveNavPath, activeWorkspace),
    [effectiveNavPath, activeWorkspace]
  );
  const showDeliveryCmsRightMenu = useMemo(() => {
    const pathOnly = effectiveNavPath.split("?")[0] ?? "";
    return isDeliveryCmsSurface(pathOnly);
  }, [effectiveNavPath]);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const handleSidebarExpandedChange = useCallback((expanded: boolean) => {
    setSidebarExpanded(expanded);
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  const roleLabel = adminMe?.uiRole
    ? t(
        adminMe.uiRole === "master"
          ? "admin_role_master"
          : adminMe.uiRole === "manager"
            ? "admin_role_manager"
            : "admin_role_operator"
      )
    : undefined;

  if (!menuRole) {
    return <div className="min-h-screen bg-sam-app" aria-busy="true" />;
  }

  return (
    <AdminStorePointPendingProvider>
      {/* AdminOpsRealtimeBridge — single Admin-shell RT/sound/awareness owner (P0-A) */}
      <div
        data-admin
        data-admin-console="v2"
        className="admin-platform-shell flex h-[100dvh] max-h-[100dvh] w-full min-w-0 max-w-full flex-col overflow-hidden bg-[var(--admin-console-bg)]"
        style={
          {
            ["--admin-sidebar-width" as string]: sidebarExpanded ? "16rem" : "5rem",
          } as React.CSSProperties
        }
      >
        <header
          ref={headerRef}
          className="admin-platform-shell__header sticky top-0 z-40 flex min-w-0 shrink-0 flex-col border-b border-[var(--admin-console-border)] bg-[var(--admin-console-surface)]"
        >
          <div className="flex min-h-14 min-w-0 items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4">
            <button
              type="button"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-[var(--admin-console-border)] bg-[var(--admin-console-surface)] text-[var(--admin-console-fg)] hover:bg-[var(--admin-console-hover)] md:hidden"
              onClick={() => setDrawerOpen(true)}
              aria-label={t("admin_shell_sidebar_expand")}
            >
              <IconHamburger />
            </button>

            <Link
              href="/admin"
              prefetch={false}
              className="shrink-0 text-[15px] font-bold leading-5 tracking-wide text-[var(--admin-console-fg)]"
              onClick={() => setPendingNavPath("/admin")}
            >
              {t("admin_brand")}
            </Link>

            <AdminWorkspaceNav
              workspaces={workspaces}
              activeId={activeWorkspace.id}
              onNavigate={setPendingNavPath}
            />

            <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1.5 border-l border-[var(--admin-console-border)] pl-3 sm:gap-2 sm:pl-4">
              <AdminShellToolbar
                sidebarExpanded={sidebarExpanded}
                onSidebarExpandedChange={handleSidebarExpandedChange}
              />
              <AdminLanguageToggleLazy />
              <AdminTestSwitcher />
              {roleLabel ? (
                <span className="hidden rounded-sm border border-[var(--admin-console-border)] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--admin-console-muted)] lg:inline">
                  {roleLabel}
                </span>
              ) : null}
              <Link href="/philife" className="sam-btn sam-btn--outline sam-btn--sm">
                {t("common_homepage")}
              </Link>
              <AdminNotificationBell />
            </div>
          </div>
        </header>

        <div className="admin-platform-shell__body relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
          {drawerOpen ? (
            <div
              className="fixed inset-0 z-40 bg-black/50 md:hidden"
              onClick={closeDrawer}
              aria-hidden
            />
          ) : null}

          {/* Single sidebar instance — CSS handles desktop flow vs mobile drawer (avoids double active DOM). */}
          <div
            className={[
              "admin-platform-shell__sidebar-slot flex h-full min-h-0 shrink-0",
              sidebarExpanded ? "" : "max-md:hidden",
            ].join(" ")}
          >
            <AdminWorkspaceSidebar
              workspace={activeWorkspace}
              currentPath={effectiveNavPath}
              compact={!sidebarExpanded}
              isDrawerOpen={drawerOpen}
              onClose={closeDrawer}
              onNavigate={setPendingNavPath}
              roleLabel={roleLabel}
            />
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div className="admin-platform-shell__page-chrome shrink-0 border-b border-[var(--admin-console-border)] bg-[var(--admin-console-surface)] px-4 py-2">
              <AdminShellBreadcrumb crumbs={crumbs} />
            </div>
            <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
              <main className="admin-platform-shell__content min-h-0 w-full min-w-0 flex-1 overflow-x-auto overflow-y-auto px-4 py-4">
                {children}
              </main>
              {showDeliveryCmsRightMenu ? (
                <Suspense fallback={null}>
                  <AdminDeliveryCmsRightMenu />
                </Suspense>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      <GlobalPopupHostLazy />
    </AdminStorePointPendingProvider>
  );
}

/** Platform Admin console shell v2 — layout.tsx entry via AdminShell. */
export function AdminPlatformShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex h-[100dvh] items-center justify-center bg-[var(--admin-console-bg)] text-sm text-[var(--admin-console-muted)]">
          …
        </div>
      }
    >
      <AdminShellProvider>
        <AdminPlatformShellInner>{children}</AdminPlatformShellInner>
      </AdminShellProvider>
    </Suspense>
  );
}
