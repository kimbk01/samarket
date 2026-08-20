"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { formatTimeAgo } from "@/lib/utils/format";

type PostDetail = {
  id: string;
  user_id?: string | null;
  topic_slug?: string | null;
  category?: string | null;
  title?: string | null;
  content?: string | null;
  status?: string | null;
  region_label?: string | null;
  like_count?: number | null;
  comment_count?: number | null;
  view_count?: number | null;
  report_count?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  author_label?: string | null;
  images?: Array<{ id: string; url: string; sort_order: number }>;
};

export function AdminCommunityPostDetailPage({ postId }: { postId: string }) {
  const { t: tr } = useI18n();
  const dash = tr("admin_users_empty_placeholder");
  const id = postId.trim();

  const statusOptions = useMemo(
    () =>
      [
        { value: "active", labelKey: "admin_community_post_status_active" as const },
        { value: "hidden", labelKey: "admin_feed_posts_action_hide" as const },
        { value: "deleted", labelKey: "admin_feed_posts_action_delete" as const },
      ] as const,
    []
  );

  const [post, setPost] = useState<PostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) {
      setErr(tr("admin_posts_err_community_load"));
      setPost(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(`/api/admin/community/engine/posts/${encodeURIComponent(id)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json()) as { ok?: boolean; post?: PostDetail; error?: string };
      if (!res.ok || !j.ok || !j.post) {
        setErr(j.error ?? tr("admin_posts_err_community_load"));
        setPost(null);
        return;
      }
      setPost(j.post);
    } catch (e) {
      setErr((e as Error).message);
      setPost(null);
    } finally {
      setLoading(false);
    }
  }, [id, tr]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchStatus = useCallback(
    async (status: string) => {
      setBusy(true);
      setErr("");
      try {
        const res = await fetch(`/api/admin/community/engine/posts/${encodeURIComponent(id)}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        const j = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !j.ok) {
          setErr(j.error ?? tr("admin_posts_err_community_patch"));
          return;
        }
        await load();
      } finally {
        setBusy(false);
      }
    },
    [id, load, tr]
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <AdminPageHeader titleKey="admin_posts_page_title" backHref="/admin/community/posts" />
        <p className="sam-text-body text-sam-muted">{tr("common_loading")}</p>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="space-y-4">
        <AdminPageHeader titleKey="admin_posts_page_title" backHref="/admin/community/posts" />
        <p className="sam-text-body-secondary text-red-700">{err || tr("admin_posts_empty_community")}</p>
      </div>
    );
  }

  const uid = String(post.user_id ?? "").trim();
  const authorLabel = String(post.author_label ?? "").trim() || dash;
  const topic = String(post.topic_slug ?? post.category ?? "").trim();
  const title = String(post.title ?? "").trim() || tr("admin_posts_no_title");
  const images = Array.isArray(post.images) ? post.images : [];

  return (
    <div className="space-y-4">
      <AdminPageHeader title={title} backHref="/admin/community/posts" />

      {err ? (
        <div className="rounded-ui-rect border border-red-200 bg-red-50 px-3 py-2 sam-text-body-secondary text-red-800">
          {err}
        </div>
      ) : null}

      <AdminCard titleKey="admin_feed_posts_col_title">
        <dl className="grid gap-3 sam-text-body sm:grid-cols-2">
          <div>
            <dt className="text-sam-muted">{tr("admin_posts_col_topic")}</dt>
            <dd>
              {topic ? (
                <Link
                  href={`/admin/community/posts?topicSlug=${encodeURIComponent(topic)}`}
                  className="text-signature hover:underline"
                >
                  {topic}
                </Link>
              ) : (
                dash
              )}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{tr("admin_posts_col_author")}</dt>
            <dd>
              {uid ? (
                <Link
                  href={`/admin/users/${encodeURIComponent(uid)}`}
                  className="text-signature hover:underline"
                >
                  {authorLabel}
                </Link>
              ) : (
                authorLabel
              )}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{tr("admin_posts_col_region")}</dt>
            <dd>{String(post.region_label ?? dash)}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{tr("admin_feed_posts_col_status")}</dt>
            <dd>
              <select
                value={String(post.status ?? "active")}
                disabled={busy}
                onChange={(e) => void patchStatus(e.target.value)}
                className="rounded border border-sam-border px-2 py-1 sam-text-body-secondary"
              >
                {statusOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {tr(o.labelKey)}
                  </option>
                ))}
              </select>
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{tr("admin_posts_col_registered")}</dt>
            <dd>{post.created_at ? formatTimeAgo(post.created_at) : dash}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{tr("admin_community_comments_updated")}</dt>
            <dd>{post.updated_at ? formatTimeAgo(post.updated_at) : dash}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{tr("admin_posts_col_views")}</dt>
            <dd>{Number(post.view_count ?? 0)}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{tr("admin_posts_col_likes")}</dt>
            <dd>{Number(post.like_count ?? 0)}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{tr("admin_posts_col_comments")}</dt>
            <dd>
              <Link
                href={`/admin/community/comments?postId=${encodeURIComponent(id)}`}
                className="text-signature hover:underline"
              >
                {Number(post.comment_count ?? 0)}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{tr("admin_feed_posts_col_reported")}</dt>
            <dd>
              <Link
                href={`/admin/community/reports?targetId=${encodeURIComponent(id)}`}
                className="text-signature hover:underline"
              >
                {Number(post.report_count ?? 0)}
              </Link>
            </dd>
          </div>
        </dl>

        <div className="mt-4 flex flex-wrap gap-3 sam-text-body-secondary">
          <Link
            href={`/philife/${encodeURIComponent(id)}`}
            target="_blank"
            rel="noreferrer"
            className="text-signature hover:underline"
          >
            {tr("admin_community_view_on_site")}
          </Link>
          {uid ? (
            <Link
              href={`/admin/users/${encodeURIComponent(uid)}`}
              className="text-signature hover:underline"
            >
              {tr("admin_community_open_member")}
            </Link>
          ) : null}
          <Link
            href={`/admin/community/comments?postId=${encodeURIComponent(id)}`}
            className="text-signature hover:underline"
          >
            {tr("admin_menu_community_comments")}
          </Link>
          <Link
            href={`/admin/community/reports?targetId=${encodeURIComponent(id)}`}
            className="text-signature hover:underline"
          >
            {tr("admin_menu_community_reports")}
          </Link>
          <Link
            href="/admin/community/promotions"
            className="text-signature hover:underline"
          >
            {tr("admin_menu_community_promotions")}
          </Link>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void patchStatus("hidden")}
            className="sam-text-helper text-amber-700 hover:underline"
          >
            {tr("admin_feed_posts_action_hide")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void patchStatus("deleted")}
            className="sam-text-helper text-red-600 hover:underline"
          >
            {tr("admin_feed_posts_action_delete")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void patchStatus("active")}
            className="sam-text-helper text-emerald-700 hover:underline"
          >
            {tr("admin_feed_posts_action_restore")}
          </button>
        </div>
      </AdminCard>

      <AdminCard titleKey="admin_community_comments_col_body">
        <div className="whitespace-pre-wrap sam-text-body text-sam-fg">
          {String(post.content ?? "").trim() || dash}
        </div>
        {images.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {images.map((img) => (
              <div key={img.id || img.url} className="h-24 w-24 overflow-hidden rounded-ui-rect border border-sam-border">
                <SamarketThumbnail src={img.url} alt="" className="h-full w-full" size={96} />
              </div>
            ))}
          </div>
        ) : null}
      </AdminCard>

      <details className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2">
        <summary className="cursor-pointer sam-text-helper text-sam-muted">
          {tr("admin_community_system_info")}
        </summary>
        <dl className="mt-2 space-y-1 font-mono sam-text-xxs text-sam-meta">
          <div>
            <dt className="inline text-sam-muted">{tr("admin_feed_report_detail_col_id")}: </dt>
            <dd className="inline break-all">{id}</dd>
          </div>
          {uid ? (
            <div>
              <dt className="inline text-sam-muted">{tr("admin_posts_col_author")}: </dt>
              <dd className="inline break-all">{uid}</dd>
            </div>
          ) : null}
        </dl>
      </details>
    </div>
  );
}
