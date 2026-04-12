"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getAdminRole } from "@/lib/admin-permission";
import {
  OPS_QUICK_LINKS_PRIORITY,
  MANAGE_QUICK_LINKS_PRIORITY,
} from "@/lib/admin-menu-config";

interface LinkItem {
  href: string;
  label: string;
}

const DEV_LINKS: LinkItem[] = [
  { href: "/admin/qa-board", label: "QA보드" },
  { href: "/admin/release-notes", label: "릴리즈노트" },
  { href: "/admin/system", label: "시스템상태" },
  { href: "/admin/backup", label: "백업/복구" },
  { href: "/admin/audit-logs", label: "로그감사" },
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
      <h2 className="mb-3 text-[13px] font-medium text-sam-fg">
        {title}
      </h2>
      <ul className="flex flex-wrap gap-2">
        {links.map(({ href, label }) => (
          <li key={href}>
            <Link
              href={href}
              className="inline-block rounded border border-sam-border bg-sam-app px-3 py-1.5 text-[13px] text-sam-fg hover:border-signature hover:bg-signature/5 hover:text-signature whitespace-nowrap"
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
  const { tt, t } = useI18n();
  const role = getAdminRole();
  const showManage = role === "manager" || role === "master";
  const showDev = role === "master";

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Card title={t("admin_quicklinks_ops")} links={OPS_QUICK_LINKS_PRIORITY.map((row) => ({ ...row, label: tt(row.label) }))} />
      {showManage && (
        <Card
          title={t("admin_quicklinks_manage")}
          links={MANAGE_QUICK_LINKS_PRIORITY.map((row) => ({ ...row, label: tt(row.label) }))}
        />
      )}
      {showDev && (
        <Card title={t("admin_quicklinks_dev")} links={DEV_LINKS.map((row) => ({ ...row, label: tt(row.label) }))} />
      )}
    </div>
  );
}
