"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { getAdminRole } from "@/lib/admin-permission";
import {
  OPS_QUICK_LINKS_PRIORITY,
  MANAGE_QUICK_LINKS_PRIORITY,
} from "@/lib/admin-menu-config";

interface LinkItem {
  href: string;
  label: string;
}

const DEV_LINKS: { href: string; labelKey: MessageKey }[] = [
  { href: "/admin/qa-board", labelKey: "admin_menu_dev_qa" },
  { href: "/admin/release-notes", labelKey: "admin_menu_dev_release_notes" },
  { href: "/admin/system", labelKey: "admin_menu_dev_system_status" },
  { href: "/admin/backup", labelKey: "admin_menu_dev_backup" },
  { href: "/admin/audit-logs", labelKey: "admin_menu_dev_audit" },
];

function Card({
  title,
  links,
}: {
  title: string;
  links: LinkItem[];
}) {
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
  const role = getAdminRole();
  const showManage = role === "manager" || role === "master";
  const showDev = role === "master";

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Card
        title={t("admin_quicklinks_ops")}
        links={OPS_QUICK_LINKS_PRIORITY.map((row) => ({ href: row.href, label: t(row.labelKey) }))}
      />
      {showManage && (
        <Card
          title={t("admin_quicklinks_manage")}
          links={MANAGE_QUICK_LINKS_PRIORITY.map((row) => ({
            href: row.href,
            label: t(row.labelKey),
          }))}
        />
      )}
      {showDev && (
        <Card
          title={t("admin_quicklinks_dev")}
          links={DEV_LINKS.map((row) => ({ href: row.href, label: t(row.labelKey) }))}
        />
      )}
    </div>
  );
}
