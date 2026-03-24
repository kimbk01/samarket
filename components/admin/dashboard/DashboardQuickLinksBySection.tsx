"use client";

import Link from "next/link";
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
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="mb-3 text-[13px] font-medium text-gray-700">
        {title}
      </h2>
      <ul className="flex flex-wrap gap-2">
        {links.map(({ href, label }) => (
          <li key={href}>
            <Link
              href={href}
              className="inline-block rounded border border-gray-200 bg-gray-50 px-3 py-1.5 text-[13px] text-gray-700 hover:border-signature hover:bg-signature/5 hover:text-signature whitespace-nowrap"
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
  const role = getAdminRole();
  const showManage = role === "manager" || role === "master";
  const showDev = role === "master";

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Card title="실질 운영 바로가기" links={OPS_QUICK_LINKS_PRIORITY} />
      {showManage && (
        <Card title="관리/보고 바로가기" links={MANAGE_QUICK_LINKS_PRIORITY} />
      )}
      {showDev && (
        <Card title="개발/시스템 바로가기" links={DEV_LINKS} />
      )}
    </div>
  );
}
