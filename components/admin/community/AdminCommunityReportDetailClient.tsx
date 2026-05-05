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

  return (
    <div className="space-y-4">
      <AdminPageHeader
        titleKey="admin_feed_report_detail_title"
        backHref="/admin/reports"
        descriptionKey="admin_feed_report_detail_desc"
      />

      <AdminCard titleKey="admin_feed_report_detail_card_info">
        <dl className="grid gap-2 sam-text-body">
          <div>
            <dt className="text-sam-muted">{tr("admin_feed_report_detail_col_id")}</dt>
            <dd className="font-mono sam-text-helper text-sam-fg">{row.id}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{tr("admin_feed_report_detail_target")}</dt>
            <dd className="font-mono sam-text-helper">
              {row.target_type} · {row.target_id}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{tr("admin_feed_report_detail_post")}</dt>
            <dd>
              {row.target_type === "post" && row.post_title ? (
                <Link
                  href={`/philife/${row.target_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-sam-primary hover:text-sam-primary-hover hover:underline"
                >
                  {row.post_title}
                </Link>
              ) : (
                <span className="text-sam-meta">{dash}</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{tr("admin_feed_report_detail_reporter")}</dt>
            <dd className="font-mono sam-text-helper">{row.reporter_id}</dd>
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
          <Link href="/admin/philife/reports" className="text-sam-primary hover:text-sam-primary-hover hover:underline">
            {tr("admin_feed_report_back_list")}
          </Link>
        </p>
      </AdminCard>
    </div>
  );
}
