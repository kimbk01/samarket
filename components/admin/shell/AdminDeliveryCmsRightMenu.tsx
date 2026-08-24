"use client";

/**
 * Delivery CMS right rail — shell-level secondary menu.
 * Primary IA lives in AdminWorkspaceSidebar (운영). This rail must not
 * duplicate as a content-left column.
 */

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useAdminShell } from "@/components/admin/AdminShellContext";
import {
  DELIVERY_CMS_HELP_CATEGORY,
  DELIVERY_CMS_HELP_HOME,
  DELIVERY_CMS_SIDEBAR,
  type DeliveryCmsSidebarNode,
} from "@/lib/admin/delivery-cms-nav";

function RightNavLink({
  node,
  pathname,
  search,
  ko,
  depth = 0,
  onNavigate,
}: {
  node: DeliveryCmsSidebarNode;
  pathname: string;
  search: string;
  ko: boolean;
  depth?: number;
  onNavigate?: (path: string) => void;
}) {
  const active =
    node.match?.(pathname, search) ??
    (node.href ? pathname.startsWith(node.href.split("?")[0]!) : false);
  const label = ko ? node.labelKo : node.labelEn;

  if (node.children?.length) {
    const groupActive =
      node.match?.(pathname, search) ??
      node.children.some((c) => c.match?.(pathname, search));
    return (
      <div className="mb-1">
        <div
          className={`rounded-sm px-2.5 py-1.5 text-[12px] font-semibold ${
            groupActive
              ? "bg-[var(--admin-console-active-bg)] text-[var(--admin-console-accent)]"
              : "text-[var(--admin-console-fg)]"
          }`}
        >
          {label}
        </div>
        <div className="ml-1.5 border-l border-[var(--admin-console-border)] pl-1.5">
          {node.children.map((child) => (
            <RightNavLink
              key={child.key}
              node={child}
              pathname={pathname}
              search={search}
              ko={ko}
              depth={depth + 1}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </div>
    );
  }

  if (!node.href) {
    return <div className="px-2.5 py-1 text-[11px] text-[var(--admin-console-muted)]">{label}</div>;
  }

  return (
    <Link
      href={node.href}
      prefetch={false}
      onClick={() => onNavigate?.(node.href!)}
      className={`mb-0.5 block rounded-sm px-2.5 py-1.5 text-[12px] ${
        active
          ? "bg-[var(--admin-console-active-bg)] font-semibold text-[var(--admin-console-accent)]"
          : "font-medium text-[var(--admin-console-fg)] hover:bg-[var(--admin-console-hover)]"
      } ${depth > 0 ? "text-[11px]" : ""}`}
      data-admin-right-menu-item={active ? "active" : "idle"}
    >
      {label}
    </Link>
  );
}

export function AdminDeliveryCmsRightMenu() {
  const { language } = useI18n();
  const ko = language === "ko";
  const pathname = usePathname() || "";
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ? `?${searchParams.toString()}` : "";
  const { setPendingNavPath } = useAdminShell();

  const helpItems = pathname.startsWith("/admin/stores-category-policy")
    ? DELIVERY_CMS_HELP_CATEGORY
    : DELIVERY_CMS_HELP_HOME;

  return (
    <aside
      className="admin-platform-shell__right-menu hidden h-full min-h-0 w-[13.5rem] shrink-0 flex-col border-l border-[var(--admin-console-border)] bg-[var(--admin-console-surface)] lg:flex"
      data-admin-right-menu="delivery-cms"
      aria-label={ko ? "배달 CMS 우측 메뉴" : "Delivery CMS right menu"}
    >
      <div className="shrink-0 border-b border-[var(--admin-console-border)] px-3 py-2.5">
        <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--admin-console-muted)]">
          {ko ? "배달 CMS" : "Delivery CMS"}
        </p>
        <p className="mt-0.5 text-[12px] font-semibold text-[var(--admin-console-fg)]">
          {ko ? "운영 바로가기" : "Ops shortcuts"}
        </p>
      </div>

      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-y-contain p-2">
        {DELIVERY_CMS_SIDEBAR.map((node) => (
          <RightNavLink
            key={node.key}
            node={node}
            pathname={pathname}
            search={search}
            ko={ko}
            onNavigate={setPendingNavPath}
          />
        ))}
      </nav>

      <div className="shrink-0 border-t border-[var(--admin-console-border)] p-3">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--admin-console-muted)]">
          Help
        </p>
        {helpItems.map((item) => (
          <p key={item.key} className="py-0.5 text-[11px] leading-snug text-[var(--admin-console-muted)]">
            {ko ? item.labelKo : item.labelEn}
          </p>
        ))}
      </div>
    </aside>
  );
}
