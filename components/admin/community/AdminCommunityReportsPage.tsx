"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import type { AppLanguageCode } from "@/lib/i18n/config";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminOpsCrossLinkBar } from "@/components/admin/AdminOpsCrossLinkBar";
import { AdminCard } from "@/components/admin/AdminCard";
import {
  AdminManagementSurfaceRoot,
  AdminManagementTableViewport,
} from "@/components/admin/management";
import type { CommunityReportAdminRow } from "@/lib/community-feed/admin-community-reports";
import {
  ARO_IA_001_OWNERS,
  ARO_IA_001_SUPPORT_PATH,
} from "@/lib/admin/aro-ia-001-community-common-links";
import { computeTableMinWidthPx, managementColumnStyle, type ManagementColumnKind } from "@/lib/admin/management";

export type AdminCommunityReportsFilters = {
  status: string;
  targetId: string;
  topicSlug: string;
  reporterId: string;
  authorId: string;
};

/** State-based CTAs — not status echo labels. */
const FEED_REPORT_ACTION_CTA_KEYS = {
  reviewing: "admin_meeting_reports_action_start_review",
  resolved: "admin_meeting_reports_action_resolve",
  dismissed: "admin_stores_reports_dismiss",
} as const satisfies Record<"reviewing" | "resolved" | "dismissed", MessageKey>;

const REPORT_COLUMN_KINDS: ManagementColumnKind[] = [
  "METADATA",
  "TITLE",
  "IDENTITY",
  "IDENTITY",
  "TITLE",
  "DATE",
  "STATUS",
  "ACTIONS",
];

function nextReportActions(
  status: string
): Array<"reviewing" | "resolved" | "dismissed"> {
  const s = status.trim().toLowerCase();
  if (s === "pending" || s === "open") return ["reviewing"];
  if (s === "reviewing") return ["resolved", "dismissed"];
  return [];
}

const STATUS_FILTERS = [
  { value: "", labelKey: "admin_community_report_filter_all" as const },
  { value: "pending", labelKey: "admin_community_report_status_pending" as const },
  { value: "open", labelKey: "admin_feed_report_status_open" as const },
  { value: "reviewing", labelKey: "admin_report_status_reviewing" as const },
  { value: "resolved", labelKey: "admin_report_status_resolved" as const },
  { value: "dismissed", labelKey: "admin_feed_reports_status_dismissed" as const },
] as const;

function dateLocaleTag(language: AppLanguageCode): string {
  return language === "en" ? "en-US" : "ko-KR";
}

export function AdminCommunityReportsPage({
  initialRows,
  highlightId = "",
  filters,
}: {
  initialRows: CommunityReportAdminRow[];
  highlightId?: string;
  filters: AdminCommunityReportsFilters;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { t: tr, language } = useI18n();
  const dateLocale = dateLocaleTag(language);
  const dash = tr("admin_users_empty_placeholder");
  const [rows, setRows] = useState(initialRows);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [patchErr, setPatchErr] = useState("");
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  useEffect(() => {
    const id = highlightId.trim();
    if (!id) return;
    const el = rowRefs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("bg-amber-50");
      const timeoutId = window.setTimeout(() => el.classList.remove("bg-amber-50"), 2500);
      return () => window.clearTimeout(timeoutId);
    }
  }, [highlightId, rows]);

  const replaceFilters = (next: Partial<AdminCommunityReportsFilters>) => {
    const merged = { ...filters, ...next };
    const q = new URLSearchParams();
    if (merged.status) q.set("status", merged.status);
    if (merged.targetId) q.set("targetId", merged.targetId);
    if (merged.topicSlug) q.set("topicSlug", merged.topicSlug);
    if (merged.reporterId) q.set("reporterId", merged.reporterId);
    if (merged.authorId) q.set("authorId", merged.authorId);
    if (highlightId.trim()) q.set("rid", highlightId.trim());
    const href = q.toString() ? `${pathname}?${q.toString()}` : pathname;
    router.replace(href);
  };

  const patch = async (id: string, status: string) => {
    setBusyId(id);
    setPatchErr("");
    try {
      const res = await fetch(`/api/admin/community-reports/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && j.ok) {
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
        router.refresh();
      } else {
        setPatchErr(j.error ?? tr("admin_feed_reports_patch_fail", { status: res.status }));
      }
    } catch {
      setPatchErr(tr("admin_feed_reports_network_err"));
    } finally {
      setBusyId(null);
    }
  };

  const tableMinWidth = computeTableMinWidthPx(REPORT_COLUMN_KINDS);

  return (
    <AdminManagementSurfaceRoot wave="w3" proofSurface="community-reports" className="space-y-4">
      <span className="sr-only" data-admin-community-reports-owner={ARO_IA_001_OWNERS.report} />
      <span className="sr-only" data-admin-writer={ARO_IA_001_OWNERS.report} />
      <AdminPageHeader titleKey="admin_feed_reports_page_title" backHref="/admin/community" />
      <Suspense fallback={null}>
        <AdminOpsCrossLinkBar
          links={[
            {
              href: ARO_IA_001_SUPPORT_PATH,
              labelKo: "고객지원 Case 보기",
              labelEn: "Open Support cases",
              dataAttr: "community-report-to-support",
            },
          ]}
          noteKo="콘텐츠·행위 moderation입니다. 회원/Owner 문의 Case는 고객지원에서 처리합니다."
          noteEn="Content/behavior moderation. Member/Owner inquiry Cases are handled in Support."
        />
      </Suspense>
      <AdminCard titleKey="admin_feed_reports_card_title">
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-0.5">
            <span className="sam-text-helper text-sam-muted">{tr("admin_feed_reports_col_status")}</span>
            <select
              value={filters.status}
              onChange={(e) => replaceFilters({ status: e.target.value })}
              className="rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1.5 sam-text-body-secondary"
            >
              {STATUS_FILTERS.map((o) => (
                <option key={o.value || "all"} value={o.value}>
                  {tr(o.labelKey)}
                </option>
              ))}
            </select>
          </label>
          {filters.targetId || filters.topicSlug || filters.reporterId || filters.authorId ? (
            <button
              type="button"
              onClick={() =>
                replaceFilters({
                  targetId: "",
                  topicSlug: "",
                  reporterId: "",
                  authorId: "",
                })
              }
              className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 sam-text-body-secondary"
            >
              {tr("admin_community_report_filter_all")}
            </button>
          ) : null}
        </div>

        {patchErr ? (
          <p
            className="mb-2 rounded bg-red-50 px-3 py-2 sam-text-helper text-red-700"
            data-admin-mgmt-state="ERROR"
          >
            {patchErr}
          </p>
        ) : null}
        {rows.length === 0 ? (
          <p className="sam-text-body-secondary text-sam-muted" data-admin-mgmt-state="EMPTY">
            {tr("admin_feed_reports_empty")}
          </p>
        ) : (
          <AdminManagementTableViewport className="min-w-0">
            <table
              className="w-full table-fixed border-collapse text-left sam-text-helper"
              style={{ minWidth: tableMinWidth }}
              data-admin-mgmt-table-min-width={String(tableMinWidth)}
            >
              <thead>
                <tr className="border-b border-sam-border text-sam-muted">
                  <th className="py-2 pr-2 font-medium" style={managementColumnStyle("METADATA")}>
                    {tr("admin_feed_reports_col_target")}
                  </th>
                  <th className="py-2 pr-2 font-medium" style={managementColumnStyle("TITLE")}>
                    {tr("admin_feed_reports_col_post")}
                  </th>
                  <th className="py-2 pr-2 font-medium" style={managementColumnStyle("IDENTITY")}>
                    {tr("admin_feed_reports_col_reporter")}
                  </th>
                  <th className="py-2 pr-2 font-medium" style={managementColumnStyle("IDENTITY")}>
                    {tr("admin_feed_reports_col_author")}
                  </th>
                  <th className="py-2 pr-2 font-medium" style={managementColumnStyle("TITLE")}>
                    {tr("admin_feed_reports_col_reason")}
                  </th>
                  <th className="py-2 pr-2 font-medium" style={managementColumnStyle("DATE")}>
                    {tr("admin_feed_reports_col_time")}
                  </th>
                  <th className="py-2 pr-2 font-medium" style={managementColumnStyle("STATUS")}>
                    {tr("admin_feed_reports_col_status")}
                  </th>
                  <th className="py-2 font-medium" style={managementColumnStyle("ACTIONS")}>
                    {tr("admin_feed_reports_col_actions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const reporterLabel = String(r.reporter_label ?? "").trim() || dash;
                  const authorLabel = String(r.author_label ?? "").trim() || dash;
                  const authorId = String(r.post_author_id ?? "").trim();
                  const nextActions = nextReportActions(String(r.status ?? ""));
                  return (
                    <tr
                      key={r.id}
                      ref={(el) => {
                        rowRefs.current[r.id] = el;
                      }}
                      className="border-b border-sam-border-soft align-top transition-colors duration-500"
                    >
                      <td className="py-2 pr-2" style={managementColumnStyle("METADATA")}>
                        {tr("admin_community_target_type_post")}
                      </td>
                      <td className="truncate py-2 pr-2" style={managementColumnStyle("TITLE")}>
                        {r.target_type === "post" && r.target_id ? (
                          <Link
                            href={`/admin/community/posts/${encodeURIComponent(r.target_id)}`}
                            className="text-sam-primary hover:text-sam-primary-hover hover:underline"
                          >
                            {r.post_title?.trim() || tr("admin_posts_no_title")}
                          </Link>
                        ) : (
                          <span className="text-sam-meta">{dash}</span>
                        )}
                      </td>
                      <td className="truncate py-2 pr-2" style={managementColumnStyle("IDENTITY")}>
                        {r.reporter_id ? (
                          <Link
                            href={`/admin/users/${encodeURIComponent(r.reporter_id)}`}
                            className="text-sam-primary hover:underline"
                          >
                            {reporterLabel}
                          </Link>
                        ) : (
                          reporterLabel
                        )}
                      </td>
                      <td className="truncate py-2 pr-2" style={managementColumnStyle("IDENTITY")}>
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
                      </td>
                      <td className="py-2 pr-2 text-sam-fg" style={managementColumnStyle("TITLE")}>
                        <span className="font-medium text-sam-muted">{r.reason_type}</span>
                        {r.reason_text ? (
                          <p className="mt-0.5 line-clamp-2 sam-text-xxs">{r.reason_text}</p>
                        ) : null}
                      </td>
                      <td
                        className="whitespace-nowrap py-2 pr-2 text-sam-muted"
                        style={managementColumnStyle("DATE")}
                      >
                        {r.created_at ? new Date(r.created_at).toLocaleString(dateLocale) : dash}
                      </td>
                      <td className="py-2 pr-2" style={managementColumnStyle("STATUS")}>
                        {r.status}
                      </td>
                      <td className="py-2" style={managementColumnStyle("ACTIONS")}>
                        <div className="flex flex-wrap gap-1" data-admin-report-cta-state={r.status}>
                          <Link
                            href={`/admin/reports/${encodeURIComponent(r.id)}`}
                            className="rounded border border-sam-border px-2 py-0.5 sam-text-xxs text-sam-primary hover:bg-sam-app"
                          >
                            {tr("admin_report_th_detail")}
                          </Link>
                          {nextActions.map((s) => (
                            <button
                              key={s}
                              type="button"
                              disabled={busyId === r.id}
                              onClick={() => void patch(r.id, s)}
                              className="rounded border border-sam-border px-2 py-0.5 sam-text-xxs hover:bg-sam-app disabled:opacity-40"
                            >
                              {tr(FEED_REPORT_ACTION_CTA_KEYS[s])}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </AdminManagementTableViewport>
        )}
      </AdminCard>
    </AdminManagementSurfaceRoot>
  );
}
