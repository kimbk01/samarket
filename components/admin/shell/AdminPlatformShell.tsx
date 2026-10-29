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
import { AdminInboxLink } from "@/components/admin/inbox/AdminInboxLink";
import { AdminStorePointPendingProvider } from "@/components/admin/store-points/AdminStorePointPendingProvider";
import { AdminShellProvider, useAdminShell } from "@/components/admin/AdminShellContext";
import { AdminWorkspaceNav } from "@/components/admin/shell/AdminWorkspaceNav";
import { AdminWorkspaceSidebar } from "@/components/admin/shell/AdminWorkspaceSidebar";
import { AdminShellBreadcrumb } from "@/components/admin/shell/AdminShellBreadcrumb";
import { AdminDeliveryCmsRightMenu } from "@/components/admin/shell/AdminDeliveryCmsRightMenu";
import { AdminHeaderClock } from "@/components/admin/shell/AdminHeaderClock";
import { AdminHeaderAccountMenu } from "@/components/admin/shell/AdminHeaderAccountMenu";
import { AdminHeaderQuickSearch } from "@/components/admin/shell/AdminHeaderQuickSearch";
import { AdminConfirmHost } from "@/components/admin/ui/AdminConfirmHost";
import {
  listAdminWorkspaces,
  resolveActiveWorkspace,
  resolveAdminBreadcrumb,
} from "@/lib/admin/admin-workspace-routing";
import { isDeliveryCmsSurface } from "@/lib/admin/delivery-cms-nav";
import { adminMenu, filterMenuByRole } from "@/components/admin/admin-menu";
import { filterAdminMenuByAccess } from "@/lib/admin/access/admin-access-ui";
import { canAccessAdminRoute } from "@/lib/admin/access/admin-route-access";
import { AdminRoutePageGate } from "@/components/admin/access/AdminRoutePageGate";
import { useAdminAccessActor } from "@/components/admin/access/use-admin-route-access";
import { readSidebarExpanded } from "@/lib/admin-ui-prefs";
import { getAdminRole } from "@/lib/admin-permission";
import type { AdminRole } from "@/lib/admin-menu-config";
import type { AdminMenuRole } from "@/components/admin/admin-menu";
import { OverlayScopeProvider } from "@/components/ui/dibay-overlay/overlay-scope";
import { deliveryScopeAttrs } from "@/lib/ui/delivery-scope";

/** 관리자 「배달」 워크스페이스(메뉴 SSOT `resolveActiveWorkspace`) 본문·포털 — 배달 상태색·글자 AA 스코프 */
const ADMIN_DELIVERY_SCOPE = deliveryScopeAttrs("admin");

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
  const { actor: accessActor } = useAdminAccessActor();

  /**
   * 메뉴 노출 = 서버 권한 (설계 v4 §4-3): 역할 필터 + 접근표 필터.
   * `/me` 로딩 중(actor 없음)에는 기존처럼 역할 필터만 적용한다.
   */
  const accessMenu = useMemo(
    () =>
      accessActor
        ? filterAdminMenuByAccess(filterMenuByRole(adminMenu, resolvedMenuRole), accessActor)
        : adminMenu,
    [accessActor, resolvedMenuRole]
  );

  const workspaces = useMemo(
    () => listAdminWorkspaces(resolvedMenuRole, accessMenu),
    [resolvedMenuRole, accessMenu]
  );
  const activeWorkspace = useMemo(
    () => resolveActiveWorkspace(effectiveNavPath, resolvedMenuRole, accessMenu),
    [effectiveNavPath, resolvedMenuRole, accessMenu]
  );
  const crumbs = useMemo(
    () => resolveAdminBreadcrumb(effectiveNavPath, activeWorkspace),
    [effectiveNavPath, activeWorkspace]
  );
  const isDeliveryWorkspace = activeWorkspace.id === "delivery";
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

  /** 상단 공통 조회·계정 메뉴 — 접근표로 열 수 있는 화면만 (actor 로딩 중이면 숨김). */
  const canSearchMembers = accessActor ? canAccessAdminRoute("/admin/users", accessActor) : false;
  const canSearchOrders = accessActor ? canAccessAdminRoute("/admin/stores/orders", accessActor) : false;
  const canManageStaff = accessActor ? canAccessAdminRoute("/admin/staff", accessActor) : false;

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
          {/*
           * 2단 헤더 (감사 UX-01~03): 1단 = 브랜드·조회·도구·계정, 2단 = 워크스페이스 탭 전용 한 줄.
           * 한 줄에 함께 두면 도구 묶음이 탭 폭을 빼앗아 1280px 에서 탭 8개가 가려졌다.
           * 언어 전환·홈페이지 이동은 계정 메뉴 안으로 옮겨 1024px 에서도 1단이 넘치지 않는다.
           */}
          <div className="flex min-h-12 min-w-0 items-center gap-2 px-3 py-1.5 sm:gap-3 sm:px-4">
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

            <div className="min-w-0 flex-1">
              <AdminHeaderQuickSearch canSearchMembers={canSearchMembers} canSearchOrders={canSearchOrders} />
            </div>

            <div className="ml-auto flex shrink-0 items-center justify-end gap-1.5 sm:gap-2">
              <AdminHeaderClock />
              <AdminShellToolbar
                sidebarExpanded={sidebarExpanded}
                onSidebarExpandedChange={handleSidebarExpandedChange}
              />
              <AdminTestSwitcher />
              <AdminInboxLink />
              <AdminNotificationBell />
              {/* 관리자 계정 — 1024 폭에서도 보인다 (이름 · 역할 · 계정 메뉴 · 언어 · 홈페이지) */}
              <AdminHeaderAccountMenu
                displayName={adminMe?.displayName ?? null}
                loginId={adminMe?.loginId ?? null}
                roleLabel={roleLabel ?? null}
                canManageStaff={canManageStaff}
                languageToggle={<AdminLanguageToggleLazy />}
              />
            </div>
          </div>

          <div className="flex min-w-0 items-center border-t border-[var(--admin-console-border)] px-3 sm:px-4">
            <AdminWorkspaceNav
              workspaces={workspaces}
              activeId={activeWorkspace.id}
              onNavigate={setPendingNavPath}
            />
          </div>
        </header>

        <div className="admin-platform-shell__body relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
          {drawerOpen ? (
            <div
              className="fixed inset-0 z-[45] bg-black/50 md:hidden"
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
            <div
              className="admin-platform-shell__page-chrome shrink-0 border-b border-[var(--admin-console-border)] bg-[var(--admin-console-surface)] px-4 py-2"
              data-admin-page-chrome="1"
            >
              <AdminShellBreadcrumb crumbs={crumbs} />
            </div>
            <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
              <main
                className="admin-platform-shell__content min-h-0 w-full min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-4"
                data-admin-main-content="1"
                data-delivery-scope={isDeliveryWorkspace ? "admin" : undefined}
              >
                <OverlayScopeProvider attrs={isDeliveryWorkspace ? ADMIN_DELIVERY_SCOPE : null}>
                  <AdminRoutePageGate>{children}</AdminRoutePageGate>
                </OverlayScopeProvider>
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
      <AdminConfirmHost />
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
