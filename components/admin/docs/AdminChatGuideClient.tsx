"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminGuideMarkdown } from "@/components/admin/docs/AdminGuideMarkdown";

export function AdminChatGuideClient({ content }: { content: string }) {
  const { t: tr } = useI18n();
  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_docs_chat_title" />
      <p className="sam-text-body-secondary text-sam-muted">
        {tr("admin_docs_chat_cross_before")}
        <Link href="/admin/docs/board" className="font-medium text-signature hover:underline">
          {tr("admin_docs_board_title")}
        </Link>
        {tr("admin_docs_chat_cross_after")}
      </p>
      <AdminGuideMarkdown content={content} />
    </div>
  );
}
