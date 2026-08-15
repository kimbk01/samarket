"use client";

import { dibayConfirm } from "@/components/ui/dibay-overlay";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getAdminComments } from "@/lib/admin-comments/getAdminComments";
import { deleteCommentAdmin } from "@/lib/admin-comments/updateCommentAdmin";
import type { AdminCommentRow } from "@/lib/admin-comments/getAdminComments";
import { formatTimeAgo } from "@/lib/utils/format";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export function AdminCommentsPageContent() {
  const { t: tr } = useI18n();
  const [comments, setComments] = useState<AdminCommentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const deleteLabel = tr("admin_feed_posts_action_delete");

  const load = useCallback(async () => {
    setLoading(true);
    const list = await getAdminComments();
    setComments(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!(await dibayConfirm({ title: tr("admin_comments_confirm_delete"), confirmTone: "destructive" }))) return;
      const res = await deleteCommentAdmin(id);
      if (res.ok) load();
    },
    [load, tr]
  );

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_comments_page_title" />
      {loading ? (
        <div className="py-12 text-center sam-text-body text-sam-muted">{tr("common_loading")}</div>
      ) : comments.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          {tr("admin_comments_empty")}
        </div>
      ) : (
        <div className="space-y-2">
          {comments.map((c) => (
            <div
              key={c.id}
              className="flex items-start justify-between gap-4 rounded-ui-rect border border-sam-border bg-sam-surface p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="sam-text-body text-sam-fg">{c.content}</p>
                <p className="mt-1 sam-text-helper text-sam-muted">
                  post: {c.post_id} · user: {c.user_id} · {formatTimeAgo(c.created_at)}
                </p>
                <Link
                  href={`/post/${c.post_id}`}
                  className="mt-1 inline-block sam-text-helper text-signature hover:underline"
                >
                  {tr("admin_comments_view_post")}
                </Link>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(c.id)}
                className="shrink-0 sam-text-body-secondary text-red-600 hover:underline"
                aria-label={`${deleteLabel}: ${c.content.slice(0, 40)}`}
              >
                {deleteLabel}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
