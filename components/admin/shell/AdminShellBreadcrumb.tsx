"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AdminBreadcrumbCrumb } from "@/lib/admin/admin-workspace-routing";

export function AdminShellBreadcrumb({ crumbs }: { crumbs: AdminBreadcrumbCrumb[] }) {
  const { t, tt } = useI18n();
  if (crumbs.length === 0) return null;

  return (
    <nav
      aria-label={t("admin_shell_breadcrumb")}
      className="admin-shell-breadcrumb"
      data-admin-breadcrumb="1"
    >
      <ol className="flex flex-wrap items-center gap-1.5 text-[13px] leading-5 text-[var(--admin-console-muted)]">
        {crumbs.map((crumb, index) => {
          const label = crumb.titleKey ? t(crumb.titleKey) : tt(crumb.key);
          const isLast = index === crumbs.length - 1;
          return (
            <li key={`${crumb.key}-${index}`} className="flex items-center gap-1">
              {index > 0 ? <span aria-hidden className="opacity-50">/</span> : null}
              {crumb.path && !isLast ? (
                <Link
                  href={crumb.path}
                  prefetch={false}
                  className="hover:text-[var(--admin-console-accent)] hover:underline"
                >
                  {label}
                </Link>
              ) : (
                <span
                  className={
                    isLast
                      ? "font-semibold text-[var(--admin-console-fg)]"
                      : undefined
                  }
                >
                  {label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
