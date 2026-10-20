"use client";

import { useEffect, useState } from "react";
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
import { AdminTechId } from "@/components/admin/ui/AdminTechId";
import { AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminChipButton } from "@/components/admin/ui/AdminChipButton";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";

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

/** 목록 조건 (주소 보존) — 분류(`content_type`) · 검색어(`q`: 제목, UUID 면 ID). */
const NOTICES_LIST_QUERY_CONFIG = { extras: ["content_type"] as const };

/**
 * 고객센터 콘텐츠 목록 (R7) — 서버 페이지(`limit`/`offset` → `total`) · 분류·검색은 서버 필터 · 조건은 주소에 보존.
 * 불러오기 실패 시 직전 목록 유지.
 */
export function AdminAppNoticesPage() {
  const { t, safeT, language } = useI18n();
  const ko = language !== "en";
  const lq = useAdminListQuery<"content_type">(NOTICES_LIST_QUERY_CONFIG);
  const filterTypeRaw = lq.query.extras.content_type;
  const filterType: "all" | CustomerCenterContentType = (CUSTOMER_CENTER_CONTENT_TYPES as readonly string[]).includes(
    filterTypeRaw
  )
    ? (filterTypeRaw as CustomerCenterContentType)
    : "all";
  const [items, setItems] = useState<AdminNotice[]>([]);
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [campaignByContent, setCampaignByContent] = useState<
    Record<string, { status: string; when: string }>
  >({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<{ code: string; httpStatus?: number } | null>(null);
  const [tableMissing, setTableMissing] = useState(false);
  const { apiQueryString, refreshKey, refresh } = lq;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    void (async () => {
      try {
        const res = await fetch(`/api/admin/app-notices?${apiQueryString}`, {
          credentials: "include",
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          notices?: AdminNotice[];
          total?: number;
          table_missing?: boolean;
          error?: string;
        };
        if (cancelled) return;
        setTableMissing(Boolean(json.table_missing));
        if (!res.ok || !json.ok) {
          // 실패 시 직전 목록 유지
          setErr({ code: typeof json.error === "string" ? json.error : "load_failed", httpStatus: res.status });
          return;
        }
        const rows = Array.isArray(json.notices) ? json.notices : [];
        setItems(rows);
        setTotal(typeof json.total === "number" ? json.total : rows.length);
        setLoaded(true);

        const cr = await fetch(`/api/admin/notification-campaigns?audience=ops`, {
          credentials: "include",
          cache: "no-store",
        });
        const cj = (await cr.json().catch(() => ({}))) as {
          ok?: boolean;
          campaigns?: CampaignLite[];
        };
        if (cancelled) return;
        if (cr.ok && cj.ok && Array.isArray(cj.campaigns)) {
          const map: Record<string, { status: string; when: string }> = {};
          for (const c of cj.campaigns) {
            const cid = readAppNoticeId(c.target_payload);
            if (!cid || map[cid]) continue;
            map[cid] = {
              status: c.status,
              when: c.sent_at ?? c.created_at ? formatAdminManilaDateTime(c.sent_at ?? c.created_at) : "",
            };
          }
          setCampaignByContent(map);
        }
      } catch {
        if (!cancelled) setErr({ code: "network_error" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // refreshKey = apiQueryString + 새로고침 횟수
  }, [apiQueryString, refreshKey]);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="sam-text-page-title font-semibold text-sam-fg">
          {t("admin_menu_notices")}
        </h1>
        <AdminActionLink href="/admin/app/notices/create" variant="secondary">
          {t("admin_app_add")}
        </AdminActionLink>
      </div>

      <AdminFilterBar
        ko={ko}
        draft={lq.draft}
        onDraftChange={lq.setDraft}
        onSubmit={lq.submit}
        onReset={lq.reset}
        showPeriod={false}
        pending={loading}
        searchPlaceholder={safeT("admin_cc_search_ph", {
          fallbackKo: "제목 / ID",
          fallbackEn: "Title / ID",
        })}
      >
        <div className="flex flex-wrap gap-1 pb-1">
          <AdminChipButton selected={filterType === "all"} onClick={() => lq.setExtra("content_type", "")}>
            {safeT("admin_cc_filter_all", { fallbackKo: "전체", fallbackEn: "All" })}
          </AdminChipButton>
          {CUSTOMER_CENTER_CONTENT_TYPES.map((type) => (
            <AdminChipButton
              key={type}
              selected={filterType === type}
              onClick={() => lq.setExtra("content_type", type)}
            >
              {BOARD_LABEL[type][language === "en" ? "en" : "ko"]}
            </AdminChipButton>
          ))}
        </div>
      </AdminFilterBar>

      {err ? <AdminErrorState ko={ko} code={err.code} httpStatus={err.httpStatus} onRetry={refresh} /> : null}

      {loading && !loaded ? (
        <AdminLoadingState ko={ko} label={t("admin_dashboard_loading")} />
      ) : !loaded ? null : tableMissing ? (
        <AdminEmptyState ko={ko} message={t("admin_app_notices_empty")} />
      ) : items.length === 0 ? (
        lq.isFiltered ? (
          <AdminEmptyState ko={ko} onReset={lq.reset} />
        ) : (
          <AdminEmptyState
            ko={ko}
            message={safeT("admin_cc_list_empty", {
              fallbackKo: "등록된 콘텐츠가 없습니다.",
              fallbackEn: "No content yet.",
            })}
          />
        )
      ) : (
        <>
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
              {items.map((n) => {
                const contentType = parseCustomerCenterContentType(n.content_type, "notice");
                const camp = campaignByContent[n.id];
                const excerpt = excerptCustomerCenterMarkdown(String(n.body ?? ""), 80);
                return (
                  <tr key={n.id} className="border-b border-sam-border-soft hover:bg-sam-app/60">
                    <td className="px-3 py-2 font-mono text-[12px] text-sam-muted">
                      <AdminTechId id={String(n.id)} />
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
        <AdminPagination
          ko={ko}
          page={lq.query.page}
          size={lq.query.size}
          total={total}
          onPageChange={lq.setPage}
          onSizeChange={lq.setSize}
          disabled={loading}
        />
        </>
      )}
    </div>
  );
}
