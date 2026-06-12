"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  adminMenu,
  filterMenuByRole,
  type AdminMenuItem,
  type AdminMenuRole,
} from "@/components/admin/admin-menu";
import { AdminSidebarGroup } from "@/components/admin/sidebar/AdminSidebarGroup";
import { AdminSidebarItem } from "@/components/admin/sidebar/AdminSidebarItem";
import { useAdminShell } from "@/components/admin/AdminShellContext";
import { getAdminRole } from "@/lib/admin-permission";
import type { AdminRole } from "@/lib/admin-menu-config";

/** AdminRole → AdminMenuRole 매핑 */
function toMenuRole(role: AdminRole): AdminMenuRole {
  if (role === "manager") return "admin";
  if (role === "operator") return "operator";
  return "master";
}

function resolveSidebarMenuRole(
  uiRole: AdminRole | undefined,
  adminMeLoading: boolean
): AdminMenuRole {
  if (uiRole) return toMenuRole(uiRole);
  if (adminMeLoading) return "operator";
  return toMenuRole(getAdminRole());
}

export function AdminSidebar({
  desktopVisible = true,
  isMobileOpen = false,
  onClose,
}: {
  /** 데스크탑에서 사이드바 표시 여부. false면 lg: 이상에서 숨겨짐 */
  desktopVisible?: boolean;
  /** 모바일 overlay 열림 여부 */
  isMobileOpen?: boolean;
  /** 모바일에서 메뉴 링크 클릭 시 호출 */
  onClose?: () => void;
}) {
  const { t } = useI18n();
  const { adminMe, adminMeLoading, effectiveNavPath, setPendingNavPath } = useAdminShell();
  const currentPath = effectiveNavPath;
  const role = useMemo(
    () => resolveSidebarMenuRole(adminMe?.uiRole, adminMeLoading),
    [adminMe?.uiRole, adminMeLoading]
  );
  const menu = useMemo(() => filterMenuByRole(adminMenu, role), [role]);

  const asideClass = [
    "admin-sidebar sticky top-0 z-30 flex h-[100dvh] max-h-[100dvh] w-56 min-w-[14rem] shrink-0 flex-col border-r",
    !desktopVisible ? "lg:hidden" : "",
    isMobileOpen ? "admin-sidebar--open" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <aside className={asideClass}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="admin-sidebar__header flex shrink-0 items-center border-b px-3 py-3">
          <Link
            href="/admin"
            prefetch={false}
            className="admin-sidebar__brand sam-text-section-title"
            onClick={() => {
              setPendingNavPath("/admin");
              onClose?.();
            }}
          >
            {t("admin_brand")}
          </Link>
        </div>
        <nav className="admin-sidebar__nav min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-2 py-3 [-webkit-overflow-scrolling:touch] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
          {menu.map((item) =>
            item.children?.length ? (
              <AdminSidebarGroup
                key={item.key}
                item={item as AdminMenuItem & { children: AdminMenuItem[] }}
                currentPath={currentPath}
                onClose={onClose}
                onNavigate={setPendingNavPath}
              />
            ) : (
              <AdminSidebarItem
                key={item.key}
                item={item}
                currentPath={currentPath}
                depth={0}
                pathsScope={item.path ? [item.path] : undefined}
                onClose={onClose}
                onNavigate={setPendingNavPath}
              />
            )
          )}
        </nav>
      </div>
    </aside>
  );
}
