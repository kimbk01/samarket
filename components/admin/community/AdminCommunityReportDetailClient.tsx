"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import type { AppLanguageCode } from "@/lib/i18n/config";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import type { CommunityReportAdminRow } from "@/lib/community-feed/admin-community-reports";

const FEED_REPORT_DETAIL_STATUS_KEYS: Record<"open" | "reviewing" | "resolved" | "dismissed", MessageKey> = {
  open: "admin_feed_report_status_open",
  reviewing: "admin_report_status_reviewing",
  resolved: "admin_report_status_resolved",
  dismissed: "admin_feed_reports_status_dismissed",
};

function dateLocaleTag(language: AppLanguageCode): string {
  return language === "en" ? "en-US" : "ko-KR";
}

export function AdminCommunityReportDetailClient({ initialRow }: { initialRow: CommunityReportAdminRow }) {
  const router = useRouter();
  const { t: tr, language } = useI18n();
  const dateLocale = dateLocaleTag(language);
  const dash = tr("admin_users_empty_placeholder");
  const [row, setRow] = useState(initialRow);
  const [memo, setMemo] = useState(row.admin_memo ?? "");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const res = await fetch(`/api/admin/community-reports/${encodeURIComponent(row.id)}`, {
      credentials: "include",
      cache: "no-store",
    });
    const j = (await res.json()) as { ok?: boolean; row?: CommunityReportAdminRow };
    if (j.ok && j.row) {
      setRow(j.row);
      setMemo(j.row.admin_memo ?? "");
    }
    router.refresh();
  }

  async function patchStatus(status: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/community-reports/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          admin_memo: memo.trim() ? memo.trim().slice(0, 2000) : null,
        }),
      });
      const j = (await res.json()) as { ok?: boolean };
      if (j.ok) await refresh();
    } finally {
      setBusy(false);
    }
  }

  function statusLabel(status: string): string {
    const key = FEED_REPORT_DETAIL_STATUS_KEYS[status as keyof typeof FEED_REPORT_DETAIL_STATUS_KEYS];
    return key ? tr(key) : status;
  }

  const reporterLabel = String(row.reporter_label ?? "").trim() || dash;
  const authorLabel = String(row.author_label ?? "").trim() || dash;
  const authorId = String(row.post_author_id ?? "").trim();
  const reporterId = String(row.reporter_id ?? "").trim();
  const postId = row.target_type === "post" ? String(row.target_id ?? "").trim() : "";

  return (
    <div className="space-y-4">
      <AdminPageHeader
        titleKey="admin_feed_report_detail_title"
        backHref="/admin/community/reports"
        descriptionKey="admin_feed_report_detail_desc"
      />

      <AdminCard titleKey="admin_feed_report_detail_card_info">
        <dl className="grid gap-2 sam-text-body">
          <div>
            <dt className="text-sam-muted">{tr("admin_feed_report_detail_target")}</dt>
            <dd>{tr("admin_community_target_type_post")}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{tr("admin_feed_report_detail_post")}</dt>
            <dd className="flex flex-wrap gap-3">
              {postId ? (
                <>
                  <Link
                    href={`/admin/community/posts/${encodeURIComponent(postId)}`}
                    className="font-medium text-sam-primary hover:text-sam-primary-hover hover:underline"
                  >
                    {row.post_title?.trim() || tr("admin_posts_no_title")}
                  </Link>
                  <Link
                    href={`/philife/${encodeURIComponent(postId)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sam-primary hover:underline"
                  >
                    {tr("admin_community_view_on_site")}
                  </Link>
                </>
              ) : (
                <span className="text-sam-meta">{dash}</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{tr("admin_feed_report_detail_reporter")}</dt>
            <dd>
              {reporterId ? (
                <Link
                  href={`/admin/users/${encodeURIComponent(reporterId)}`}
                  className="text-sam-primary hover:underline"
                >
                  {reporterLabel}
                </Link>
              ) : (
                reporterLabel
              )}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{tr("admin_feed_report_detail_author")}</dt>
            <dd>
              {authorId ? (
                <Link
                  href={`/admin/users/${encodeURIComponent(authorId)}`}
                  className="text-sam-primary hover:underline"
                >
                  {authorLabel}
                </Link>
              ) : (
                authorLabel
              )}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{tr("admin_feed_report_detail_reason_code")}</dt>
            <dd>{row.reason_type}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{tr("admin_feed_report_detail_body")}</dt>
            <dd className="whitespace-pre-wrap sam-text-body-secondary text-sam-fg">{row.reason_text ?? dash}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{tr("admin_feed_report_detail_status")}</dt>
            <dd>
              <span className="rounded bg-sam-surface-muted px-2 py-0.5 sam-text-helper">
                {statusLabel(row.status)}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{tr("admin_feed_report_detail_created")}</dt>
            <dd>{row.created_at ? new Date(row.created_at).toLocaleString(dateLocale) : dash}</dd>
          </div>
          {row.processed_at ? (
            <div>
              <dt className="text-sam-muted">{tr("admin_feed_report_detail_processed")}</dt>
              <dd>{new Date(row.processed_at).toLocaleString(dateLocale)}</dd>
            </div>
          ) : null}
        </dl>

        <div className="mt-4 flex flex-wrap gap-3 sam-text-body-secondary">
          {authorId ? (
            <Link
              href={`/admin/users/${encodeURIComponent(authorId)}`}
              className="text-sam-primary hover:underline"
            >
              {tr("admin_community_open_member")}
            </Link>
          ) : null}
          {authorId ? (
            <Link
              href={`/admin/community/posts?userId=${encodeURIComponent(authorId)}`}
              className="text-sam-primary hover:underline"
            >
              {tr("admin_community_member_posts")}
            </Link>
          ) : null}
          {authorId ? (
            <Link
              href={`/admin/community/comments?userId=${encodeURIComponent(authorId)}`}
              className="text-sam-primary hover:underline"
            >
              {tr("admin_community_member_comments")}
            </Link>
          ) : null}
          {authorId ? (
            <Link
              href={`/admin/community/reports?authorId=${encodeURIComponent(authorId)}`}
              className="text-sam-primary hover:underline"
            >
              {tr("admin_community_member_reports_received")}
            </Link>
          ) : null}
          {reporterId ? (
            <Link
              href={`/admin/community/reports?reporterId=${encodeURIComponent(reporterId)}`}
              className="text-sam-primary hover:underline"
            >
              {tr("admin_community_member_reports_submitted")}
            </Link>
          ) : null}
        </div>
      </AdminCard>

      <AdminCard titleKey="admin_feed_report_memo_card_title">
        <label className="mb-3 flex flex-col gap-1 sam-text-body-secondary">
          <span className="text-sam-muted">{tr("admin_feed_report_memo_label")}</span>
          <textarea
            className="min-h-[100px] rounded border border-sam-border px-2 py-2"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder={tr("admin_feed_report_memo_placeholder")}
          />
        </label>
        <p className="mb-2 sam-text-helper text-sam-muted">{tr("admin_feed_report_memo_hint")}</p>
        <div className="flex flex-wrap gap-2">
          {(["open", "reviewing", "resolved", "dismissed"] as const).map((s) => (
            <button
              key={s}
              type="button"
              disabled={busy || row.status === s}
              onClick={() => void patchStatus(s)}
              className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary hover:bg-sam-app disabled:opacity-40"
            >
              {tr(FEED_REPORT_DETAIL_STATUS_KEYS[s])}
            </button>
          ))}
        </div>
        <p className="mt-4 sam-text-body-secondary">
          <Link
            href="/admin/community/reports"
            className="text-sam-primary hover:text-sam-primary-hover hover:underline"
          >
            {tr("admin_feed_report_back_list")}
          </Link>
        </p>
      </AdminCard>

      <details className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2">
        <summary className="cursor-pointer sam-text-helper text-sam-muted">
          {tr("admin_community_system_info")}
        </summary>
        <dl className="mt-2 space-y-1 font-mono sam-text-xxs text-sam-meta">
          <div>
            <dt className="inline">{tr("admin_feed_report_detail_col_id")}: </dt>
            <dd className="inline break-all">{row.id}</dd>
          </div>
          {postId ? (
            <div>
              <dt className="inline">{tr("admin_feed_report_detail_post")}: </dt>
              <dd className="inline break-all">{postId}</dd>
            </div>
          ) : null}
        </dl>
      </details>
    </div>
  );
}
