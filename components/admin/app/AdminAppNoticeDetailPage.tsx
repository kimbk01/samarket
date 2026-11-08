"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CustomerCenterSafeMarkdownBody } from "@/components/notices/CustomerCenterSafeMarkdownBody";
import {
  BOARD_LABEL,
  DEFAULT_AUTHOR_LABEL,
  parseCustomerCenterContentType,
  type CustomerCenterContentType,
} from "@/lib/notices/customer-center-content";
import { buildCustomerCenterBoardDetailPath } from "@/lib/notices/customer-center-content-paths";
import { notifStatusLabel } from "@/components/admin/points/admin-points-notifications-i18n";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";

type NoticeRow = {
  id: string;
  content_type?: string | null;
  title: string;
  body: string;
  hero_image_url?: string | null;
  author_label?: string | null;
  is_active?: boolean;
  view_count?: number;
  comment_count?: number;
  comment_enabled?: boolean;
  created_at?: string;
  updated_at?: string;
  published_at?: string | null;
};

type RelatedCampaign = {
  id: string;
  title: string;
  status: string;
  channel?: string;
  sent_at?: string | null;
  created_at?: string;
};

function readAppNoticeId(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const p = payload as Record<string, unknown>;
  if (typeof p.appNoticeId === "string") return p.appNoticeId.trim();
  if (typeof p.content_id === "string") return p.content_id.trim();
  return "";
}

export function AdminAppNoticeDetailPage() {
  const { safeT, language, t } = useI18n();
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id.trim() : "";

  const [notice, setNotice] = useState<NoticeRow | null>(null);
  const [campaigns, setCampaigns] = useState<RelatedCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/app-notices/${encodeURIComponent(id)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        notice?: NoticeRow;
        error?: string;
      };
      if (!res.ok || !j.ok || !j.notice) {
        setNotice(null);
        setErr(
          typeof j.error === "string"
            ? j.error
            : safeT("admin_app_notices_empty")
        );
        return;
      }
      setNotice(j.notice);

      const cr = await fetch(`/api/admin/notification-campaigns?audience=all`, {
        credentials: "include",
        cache: "no-store",
      });
      const cj = (await cr.json().catch(() => ({}))) as {
        ok?: boolean;
        campaigns?: Array<RelatedCampaign & { target_payload?: unknown }>;
      };
      if (cr.ok && cj.ok && Array.isArray(cj.campaigns)) {
        setCampaigns(
          cj.campaigns
            .filter((c) => readAppNoticeId(c.target_payload) === id)
            .map((c) => ({
              id: c.id,
              title: c.title,
              status: c.status,
              channel: c.channel,
              sent_at: c.sent_at,
              created_at: c.created_at,
            }))
            .slice(0, 20)
        );
      } else {
        setCampaigns([]);
      }
    } catch {
      setErr(
        safeT("admin_app_notices_empty")
      );
    } finally {
      setLoading(false);
    }
  }, [id, safeT]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!id) {
    return (
      <p className="p-4 text-sm text-sam-muted">
        {safeT("admin_app_notices_empty")}
      </p>
    );
  }

  if (loading) {
    return (
      <p className="p-4 text-sm text-sam-muted">
        {safeT("admin_dashboard_loading")}
      </p>
    );
  }

  if (err || !notice) {
    return (
      <div className="mx-auto max-w-4xl space-y-3 p-4">
        <Link href="/admin/app/notices" className="text-sm text-signature hover:underline">
          ← {safeT("admin_cc_back_list")}
        </Link>
        <p className="text-sm text-sam-danger">{err ?? "—"}</p>
        <AdminActionButton variant="secondary" size="sm" onClick={() => void load()}>
          {adminCta("refresh", language !== "en")}
        </AdminActionButton>
      </div>
    );
  }

  const contentType = parseCustomerCenterContentType(notice.content_type, "notice");
  const boardLabel = BOARD_LABEL[contentType][language === "en" ? "en" : "ko"];
  const author =
    (notice.author_label && notice.author_label.trim()) ||
    DEFAULT_AUTHOR_LABEL[contentType][language === "en" ? "en" : "ko"];
  const canonical = buildCustomerCenterBoardDetailPath(contentType, notice.id);
  const created = notice.created_at ? String(notice.created_at).slice(0, 16).replace("T", " ") : "—";
  const campaignHref = `/admin/notifications/create?${new URLSearchParams({
    type: contentType,
    deeplink: canonical,
    appNoticeId: notice.id,
  }).toString()}`;

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <Link href="/admin/app/notices" className="text-sm text-signature hover:underline">
        ← {safeT("admin_cc_back_list")}
      </Link>

      <article className="space-y-4 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-sam-muted">{boardLabel}</p>
          <h1 className="text-xl font-semibold break-words text-sam-fg">{notice.title}</h1>
          <p className="text-xs text-sam-meta">
            {[
              author,
              created,
              safeT("admin_cc_meta_views"),
              safeT("admin_cc_meta_comments"),
              notice.is_active !== false
                ? safeT("admin_app_status_visible")
                : safeT("admin_app_status_hidden"),
            ].join(" · ")}
          </p>
          <p className="break-all text-xs text-sam-muted">{canonical}</p>
        </header>

        {notice.hero_image_url ? (
          <div className="relative aspect-[16/9] w-full overflow-hidden rounded-ui-rect border border-sam-border">
            <SamarketThumbnail
              src={String(notice.hero_image_url)}
              alt=""
              fill
              fetchDisplayPx={800}
              className="h-full w-full"
              imageClassName="object-cover"
              roundedClassName="rounded-ui-rect"
            />
          </div>
        ) : null}

        <CustomerCenterSafeMarkdownBody body={notice.body || ""} />
      </article>

      <div className="flex flex-wrap gap-2">
        <Link
          href={campaignHref}
          className="rounded-ui-rect bg-signature px-4 py-2 text-sm font-medium text-white"
        >
          {safeT("admin_cc_send_notification")}
        </Link>
        <Link
          href={`/admin/app/notices/${encodeURIComponent(notice.id)}/edit`}
          className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2 text-sm font-medium"
        >
          {safeT("common_edit")}
        </Link>
        <Link
          href={canonical}
          target="_blank"
          className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2 text-sm font-medium"
        >
          {safeT("admin_cc_view_member")}
        </Link>
        <a
          href="#send-history"
          className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2 text-sm font-medium"
        >
          {safeT("admin_cc_send_history")}
        </a>
      </div>

      <section id="send-history" className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h2 className="text-sm font-semibold text-sam-fg">
          {safeT("admin_cc_send_history")}
        </h2>
        {campaigns.length === 0 ? (
          <p className="text-xs text-sam-muted">
            {safeT("admin_cc_send_history_empty")}
          </p>
        ) : (
          <ul className="space-y-2">
            {campaigns.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-ui-rect border border-sam-border-soft bg-sam-app px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-sam-fg">{c.title}</p>
                  <p className="text-xs text-sam-muted">
                    {notifStatusLabel(t, c.status)}
                    {c.sent_at || c.created_at
                      ? ` · ${String(c.sent_at ?? c.created_at).slice(0, 16).replace("T", " ")}`
                      : ""}
                  </p>
                </div>
                <Link
                  href={`/admin/notifications/${encodeURIComponent(c.id)}`}
                  className="text-xs text-signature hover:underline"
                >
                  {safeT("admin_cc_open_campaign")}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
