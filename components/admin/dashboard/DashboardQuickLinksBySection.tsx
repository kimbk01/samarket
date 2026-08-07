"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getAdminRole } from "@/lib/admin-permission";
import {
  adminUiRoleToMenuRole,
  projectDashboardQuickLinks,
} from "@/lib/admin/dashboard-quick-links";

interface LinkItem {
  href: string;
  label: string;
}

function Card({
  title,
  links,
}: {
  title: string;
  links: LinkItem[];
}) {
  if (links.length === 0) return null;
  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      <h2 className="mb-3 sam-text-body-secondary font-medium text-sam-fg">
        {title}
      </h2>
      <ul className="flex flex-wrap gap-2">
        {links.map(({ href, label }) => (
          <li key={href}>
            <Link
              href={href}
              className="inline-block rounded border border-sam-border bg-sam-app px-3 py-1.5 sam-text-body-secondary text-sam-fg hover:border-signature hover:bg-signature/5 hover:text-signature whitespace-nowrap"
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DashboardQuickLinksBySection() {
  const { t } = useI18n();
  const menuRole = adminUiRoleToMenuRole(getAdminRole());
  const sections = projectDashboardQuickLinks(menuRole);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Card
        title={t("admin_quicklinks_ops")}
        links={sections.ops.map((row) => ({ href: row.href, label: t(row.labelKey) }))}
      />
      <Card
        title={t("admin_quicklinks_manage")}
        links={sections.manage.map((row) => ({ href: row.href, label: t(row.labelKey) }))}
      />
      <Card
        title={t("admin_quicklinks_dev")}
        links={sections.dev.map((row) => ({ href: row.href, label: t(row.labelKey) }))}
      />
    </div>
  );
}
