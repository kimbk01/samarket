"use client";

/**
 * Delivery CMS chrome — mockup top strip + slim sidebar for product recovery surfaces.
 * Wraps page body; does not replace platform AdminShell auth/header.
 */

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  DELIVERY_CMS_HELP_CATEGORY,
  DELIVERY_CMS_HELP_HOME,
  DELIVERY_CMS_SIDEBAR,
  DELIVERY_CMS_TOP_NAV,
  type DeliveryCmsSidebarNode,
} from "@/lib/admin/delivery-cms-nav";

function SidebarLink({
  node,
  pathname,
  search,
  ko,
  depth = 0,
}: {
  node: DeliveryCmsSidebarNode;
  pathname: string;
  search: string;
  ko: boolean;
  depth?: number;
}) {
  const active = node.match?.(pathname, search) ?? (node.href ? pathname.startsWith(node.href.split("?")[0]!) : false);
  const label = ko ? node.labelKo : node.labelEn;

  if (node.children?.length) {
    const groupActive = node.match?.(pathname, search) ?? node.children.some((c) => c.match?.(pathname, search));
    return (
      <div className="mb-1">
        <div
          className={`rounded-ui-rect px-3 py-2 text-[13px] font-semibold ${
            groupActive ? "bg-emerald-50 text-emerald-800" : "text-sam-fg"
          }`}
        >
          {label}
        </div>
        <div className="ml-2 border-l border-sam-border pl-2">
          {node.children.map((c) => (
            <SidebarLink key={c.key} node={c} pathname={pathname} search={search} ko={ko} depth={depth + 1} />
          ))}
        </div>
      </div>
    );
  }

  if (!node.href) {
    return (
      <div className="px-3 py-1.5 text-[12px] text-sam-muted">{label}</div>
    );
  }

  return (
    <Link
      href={node.href}
      prefetch={false}
      className={`mb-0.5 block rounded-ui-rect px-3 py-2 text-[13px] font-medium ${
        active ? "bg-emerald-100 font-semibold text-emerald-900" : "text-sam-fg hover:bg-sam-surface-muted"
      } ${depth > 0 ? "text-[12px]" : ""}`}
    >
      {label}
    </Link>
  );
}

export function AdminDeliveryCmsChrome({
  children,
  help = "home",
}: {
  children: React.ReactNode;
  help?: "home" | "category";
}) {
  const { language } = useI18n();
  const ko = language === "ko";
  const pathname = usePathname() || "";
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ? `?${searchParams.toString()}` : "";
  const helpItems = help === "category" ? DELIVERY_CMS_HELP_CATEGORY : DELIVERY_CMS_HELP_HOME;

  return (
    <div className="admin-delivery-cms -mx-1" data-admin-delivery-cms="1">
      {/* Mockup top strip */}
      <div className="mb-3 overflow-x-auto rounded-ui-rect border border-sam-border bg-white px-2">
        <nav className="flex min-w-max items-center gap-1 py-1">
          <span className="mr-2 shrink-0 px-2 text-[13px] font-bold text-emerald-700">dibay {ko ? "관리자" : "Admin"}</span>
          {DELIVERY_CMS_TOP_NAV.map((item) => {
            const active = item.match(pathname, search);
            return (
              <Link
                key={item.key}
                href={item.href}
                prefetch={false}
                className={`shrink-0 border-b-2 px-3 py-2 text-[13px] font-semibold ${
                  active
                    ? "border-emerald-600 text-emerald-800"
                    : "border-transparent text-sam-muted hover:text-sam-fg"
                }`}
              >
                {ko ? item.labelKo : item.labelEn}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(200px,220px)_minmax(0,1fr)]">
        <aside className="flex min-h-[70vh] flex-col rounded-ui-rect border border-sam-border bg-white">
          <div className="border-b border-sam-border px-3 py-2.5">
            <p className="text-[12px] font-bold uppercase tracking-wide text-emerald-700">
              {ko ? "배달" : "Delivery"}
            </p>
          </div>
          <nav className="flex-1 space-y-0.5 p-2">
            {DELIVERY_CMS_SIDEBAR.map((node) => (
              <SidebarLink key={node.key} node={node} pathname={pathname} search={search} ko={ko} />
            ))}
          </nav>
          <div className="border-t border-sam-border p-3">
            <p className="mb-1 text-[10px] font-semibold uppercase text-sam-muted">Help</p>
            {helpItems.map((h) => (
              <p key={h.key} className="py-0.5 text-[11px] text-sam-muted">
                {ko ? h.labelKo : h.labelEn}
              </p>
            ))}
          </div>
        </aside>

        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
