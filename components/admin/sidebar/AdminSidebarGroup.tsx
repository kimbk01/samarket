"use client";

import { AdminSidebarItem } from "./AdminSidebarItem";
import type { AdminMenuItem } from "../admin-menu";
import { getMenuStatus, getMenuDisplayTitle } from "@/lib/admin-menu-status";

/** 그룹(children 있는 메뉴): 제목 + 하위 항목. 하위 active 시 AdminSidebarItem에서 자동 open. */
export function AdminSidebarGroup({
  item,
  currentPath,
}: {
  item: AdminMenuItem & { children: AdminMenuItem[] };
  currentPath: string;
}) {
  const status = getMenuStatus(item);
  const displayTitle = getMenuDisplayTitle(item.title, status);
  return (
    <div className="mb-4">
      <div className="mb-2 rounded-md bg-gray-100 px-3 py-2.5">
        <p className="text-[16px] font-extrabold tracking-tight text-gray-800">
          {displayTitle}
        </p>
      </div>
      <div className="space-y-0">
        {item.children.map((child) => (
          <AdminSidebarItem
            key={child.key}
            item={child}
            currentPath={currentPath}
            depth={0}
          />
        ))}
      </div>
    </div>
  );
}
