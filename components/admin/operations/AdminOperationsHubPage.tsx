"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";

export function AdminOperationsHubPage() {
  const { t } = useI18n();

  const links = useMemo(
    () =>
      [
        {
          href: "/admin/chats",
          labelKey: "admin_ops_hub_link_chats" as MessageKey,
          descKey: "admin_ops_hub_link_chats_desc" as MessageKey,
        },
        {
          href: "/admin/reports",
          labelKey: "admin_ops_hub_link_reports" as MessageKey,
          descKey: "admin_ops_hub_link_reports_desc" as MessageKey,
        },
        {
          href: "/admin/community/posts",
          labelKey: "admin_ops_hub_link_posts" as MessageKey,
          descKey: "admin_ops_hub_link_posts_desc" as MessageKey,
        },
        {
          href: "/admin/comments",
          labelKey: "admin_ops_hub_link_comments" as MessageKey,
          descKey: "admin_ops_hub_link_comments_desc" as MessageKey,
        },
        {
          href: "/admin/users",
          labelKey: "admin_ops_hub_link_users" as MessageKey,
          descKey: "admin_ops_hub_link_users_desc" as MessageKey,
        },
      ] satisfies { href: string; labelKey: MessageKey; descKey: MessageKey }[],
    []
  );

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_ops_hub_page_title" backHref="/admin" />
      <AdminCard titleKey="admin_ops_hub_card_quick_links">
        <ul className="space-y-3 sam-text-body">
          {links.map((x) => (
            <li key={x.href} className="border-b border-sam-border-soft pb-3 last:border-0 last:pb-0">
              <Link href={x.href} className="font-medium text-signature hover:underline">
                {t(x.labelKey)}
              </Link>
              <p className="mt-0.5 sam-text-body-secondary text-sam-muted">{t(x.descKey)}</p>
            </li>
          ))}
        </ul>
      </AdminCard>
      <AdminCard titleKey="admin_ops_hub_card_chat_backend">
        <p className="sam-text-body-secondary leading-relaxed text-sam-muted">
          {t("admin_ops_hub_chat_backend_p1")}
        </p>
        <p className="mt-2 sam-text-body-secondary leading-relaxed text-sam-muted">
          {t("admin_ops_hub_chat_backend_p2")}
        </p>
      </AdminCard>
    </div>
  );
}
