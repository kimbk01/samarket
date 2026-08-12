"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { AppNoticeRow } from "@/lib/types/settings-db";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  BOARD_LABEL,
  CUSTOMER_CENTER_CONTENT_TYPES,
  parseCustomerCenterContentType,
  type CustomerCenterContentType,
} from "@/lib/notices/customer-center-content";
import { excerptCustomerCenterMarkdown } from "@/lib/notices/customer-center-safe-markdown";
import { notifStatusLabel } from "@/components/admin/points/admin-points-notifications-i18n";

type AdminNotice = AppNoticeRow & {
  content_type?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  updated_at?: string;
  view_count?: number;
  comment_count?: number;
  created_at?: string;
};

type CampaignLite = {
  id: string;
  status: string;
  sent_at?: string | null;
  created_at?: string;
  target_payload?: unknown;
};

function readAppNoticeId(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const p = payload as Record<string, unknown>;
  if (typeof p.appNoticeId === "string") return p.appNoticeId.trim();
  if (typeof p.content_id === "string") return p.content_id.trim();
  return "";
}

export function AdminAppNoticesPage() {
  const { t, safeT, language } = useI18n();
  const [items, setItems] = useState<AdminNotice[]>([]);
  const [campaignByContent, setCampaignByContent] = useState<
    Record<string, { status: string; when: string }>
  >({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tableMissing, setTableMissing] = useState(false);
  const [filterType, setFilterType] = useState<"all" | CustomerCenterContentType>("all");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const sp = new URLSearchParams();
      if (filterType !== "all") sp.set("content_type", filterType);
      const res = await fetch(`/api/admin/app-notices?${sp.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        notices?: AdminNotice[];
        table_missing?: boolean;
        error?: string;
      };
      if (json.table_missing) setTableMissing(true);
      if (!res.ok || !json.ok) {
        setItems([]);
        setErr(
          typeof json.error === "string"
            ? json.error
            : safeT("admin_app_notices_empty", {
                fallbackKo: "목록을 불러오지 못했습니다",
                fallbackEn: "Could not load list",
              })
        );
        return;
      }
      setItems(Array.isArray(json.notices) ? json.notices : []);

      const cr = await fetch(`/api/admin/notification-campaigns?audience=ops`, {
        credentials: "include",
        cache: "no-store",
      });
      const cj = (await cr.json().catch(() => ({}))) as {
        ok?: boolean;
        campaigns?: CampaignLite[];
      };
      if (cr.ok && cj.ok && Array.isArray(cj.campaigns)) {
        const map: Record<string, { status: string; when: string }> = {};
        for (const c of cj.campaigns) {
          const cid = readAppNoticeId(c.target_payload);
          if (!cid || map[cid]) continue;
          map[cid] = {
            status: c.status,
            when: String(c.sent_at ?? c.created_at ?? "").slice(0, 16).replace("T", " "),
          };
        }
        setCampaignByContent(map);
      }
    } catch {
      setErr(
        safeT("admin_app_notices_empty", {
          fallbackKo: "목록을 불러오지 못했습니다",
          fallbackEn: "Could not load list",
        })
      );
    } finally {
      setLoading(false);
    }
  }, [filterType, safeT]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((n) => {
      const id = String(n.id ?? "").toLowerCase();
      const title = String(n.title ?? "").toLowerCase();
      return id.includes(needle) || title.includes(needle);
    });
  }, [items, q]);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="sam-text-page-title font-semibold text-sam-fg">
          {safeT("admin_app_notices_title", {
            fallbackKo: "고객센터 콘텐츠",
            fallbackEn: "Customer Center content",
          })}
        </h1>
        <Link
          href="/admin/app/notices/create"
          className="rounded-ui-rect bg-signature px-3 py-2 sam-text-body font-medium text-white"
        >
          {t("admin_app_add")}
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 rounded-ui-rect border border-sam-border bg-sam-surface p-3">
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setFilterType("all")}
            className={`rounded-ui-rect px-2.5 py-1.5 text-xs ${
              filterType === "all" ? "bg-signature text-white" : "border border-sam-border"
            }`}
          >
            {safeT("admin_cc_filter_all", { fallbackKo: "전체", fallbackEn: "All" })}
          </button>
          {CUSTOMER_CENTER_CONTENT_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setFilterType(type)}
              className={`rounded-ui-rect px-2.5 py-1.5 text-xs ${
                filterType === type ? "bg-signature text-white" : "border border-sam-border"
              }`}
            >
              {BOARD_LABEL[type][language === "en" ? "en" : "ko"]}
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={safeT("admin_cc_search_ph", {
            fallbackKo: "제목 / ID",
            fallbackEn: "Title / ID",
          })}
          className="min-w-[160px] flex-1 rounded border border-sam-border bg-sam-app px-2 py-1.5 text-sm"
        />
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-ui-rect border border-sam-border px-3 py-1.5 text-sm"
        >
          {safeT("admin_cc_search", { fallbackKo: "조회", fallbackEn: "Search" })}
        </button>
      </div>

      {err ? <p className="text-sm text-red-600">{err}</p> : null}

      {loading ? (
        <p className="text-sam-muted">{t("admin_dashboard_loading")}</p>
      ) : tableMissing ? (
        <p className="rounded-ui-rect bg-sam-surface p-4 sam-text-body text-sam-muted">
          {t("admin_app_notices_empty")}
        </p>
      ) : filtered.length === 0 ? (
        <p className="rounded-ui-rect bg-sam-surface p-4 sam-text-body text-sam-muted">
          {safeT("admin_cc_list_empty", {
            fallbackKo: "등록된 콘텐츠가 없습니다.",
            fallbackEn: "No content yet.",
          })}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-sam-border bg-sam-app text-[12px] text-sam-muted">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">
                  {safeT("admin_cc_col_type", { fallbackKo: "분류", fallbackEn: "Type" })}
                </th>
                <th className="px-3 py-2">
                  {safeT("admin_cc_board_title", { fallbackKo: "원본 제목", fallbackEn: "Title" })}
                </th>
                <th className="px-3 py-2">
                  {safeT("admin_cc_col_status", { fallbackKo: "상태", fallbackEn: "Status" })}
                </th>
                <th className="px-3 py-2">
                  {safeT("admin_cc_col_views", { fallbackKo: "조회", fallbackEn: "Views" })}
                </th>
                <th className="px-3 py-2">
                  {safeT("admin_cc_col_comments", { fallbackKo: "댓글", fallbackEn: "Comments" })}
                </th>
                <th className="px-3 py-2">
                  {safeT("admin_cc_col_campaign", { fallbackKo: "알림", fallbackEn: "Alert" })}
                </th>
                <th className="px-3 py-2">
                  {safeT("admin_cc_col_created", { fallbackKo: "작성일", fallbackEn: "Created" })}
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((n) => {
                const contentType = parseCustomerCenterContentType(n.content_type, "notice");
                const camp = campaignByContent[n.id];
                const excerpt = excerptCustomerCenterMarkdown(String(n.body ?? ""), 80);
                return (
                  <tr key={n.id} className="border-b border-sam-border-soft hover:bg-sam-app/60">
                    <td className="px-3 py-2 font-mono text-[11px] text-sam-muted">
                      {String(n.id).slice(0, 8)}…
                    </td>
                    <td className="px-3 py-2">
                      {BOARD_LABEL[contentType][language === "en" ? "en" : "ko"]}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/app/notices/${encodeURIComponent(n.id)}`}
                        className="font-medium text-sam-fg hover:underline"
                      >
                        {n.title}
                      </Link>
                      {excerpt ? (
                        <p className="mt-0.5 line-clamp-1 text-xs text-sam-muted">{excerpt}</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      {n.is_active ? t("admin_app_status_visible") : t("admin_app_status_hidden")}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{Number(n.view_count ?? 0)}</td>
                    <td className="px-3 py-2 tabular-nums">{Number(n.comment_count ?? 0)}</td>
                    <td className="px-3 py-2 text-xs text-sam-muted">
                      {camp
                        ? `${notifStatusLabel(t, camp.status)}${camp.when ? ` · ${camp.when}` : ""}`
                        : safeT("admin_cc_campaign_none", {
                            fallbackKo: "미발송",
                            fallbackEn: "Not sent",
                          })}
                    </td>
                    <td className="px-3 py-2 text-xs text-sam-muted">
                      {n.created_at ? String(n.created_at).slice(0, 10) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
