"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  adminMenu,
  filterMenuByRole,
  type AdminMenuItem,
  type AdminMenuRole,
} from "@/components/admin/admin-menu";
import { AdminSidebarGroup } from "@/components/admin/sidebar/AdminSidebarGroup";
import { AdminSidebarItem } from "@/components/admin/sidebar/AdminSidebarItem";
import { getAdminRole } from "@/lib/admin-permission";

/** 기존 AdminRole → AdminMenuRole 매핑. 추후 로그인 role 연동 시 여기만 수정. */
function toMenuRole(role: "operator" | "manager" | "master"): AdminMenuRole {
  if (role === "manager") return "admin";
  if (role === "operator") return "operator";
  return "master";
}

export function AdminSidebar() {
  const pathname = usePathname();
  const currentPath = pathname ?? "";
  const role = toMenuRole(getAdminRole());
  const menu = filterMenuByRole(adminMenu, role);

  return (
    <aside className="sticky top-0 z-30 flex h-screen max-h-screen w-56 min-w-[14rem] shrink-0 flex-col border-r border-gray-200 bg-white">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center border-b border-gray-100 px-3 py-3">
          <Link
            href="/admin"
            className="text-[17px] font-bold text-gray-900"
          >
            samarket 관리자
          </Link>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
          {menu.map((item) =>
            item.children?.length ? (
              <AdminSidebarGroup
                key={item.key}
                item={item as AdminMenuItem & { children: AdminMenuItem[] }}
                currentPath={currentPath}
              />
            ) : (
              <AdminSidebarItem
                key={item.key}
                item={item}
                currentPath={currentPath}
                depth={0}
                pathsScope={item.path ? [item.path] : undefined}
              />
            )
          )}
        </nav>
      </div>
    </aside>
  );
}
