"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { AdminToneBadge, type AdminTone } from "@/components/admin/ui/AdminToneBadge";
import { useAdminRouteAction } from "@/components/admin/access/use-admin-route-access";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { APP_NOTICE_AUDIENCE_LABEL_KEY } from "@/lib/notices/app-notice-audience";
import {
  ADMIN_OWNER_NOTICES_LIST_MAX,
  ADMIN_OWNER_NOTICES_PATH,
  ADMIN_OWNER_NOTICE_PUBLISH_STATE_LABEL_KEY,
  adminOwnerNoticeCreatePath,
  adminOwnerNoticeEditPath,
  type AdminOwnerNoticeListRow,
  type AdminOwnerNoticePublishState,
} from "@/lib/notices/admin-owner-notices-model";

const TH = "whitespace-nowrap px-3 py-2 text-left text-[12px] font-semibold text-sam-muted";
const TD = "align-top px-3 py-2.5 text-[13px] text-sam-fg";

const STATE_TONE: Record<AdminOwnerNoticePublishState, AdminTone> = {
  live: "success",
  scheduled: "waiting",
  ended: "neutral",
  hidden: "warning",
  archived: "neutral",
};

/**
 * 어드민 「배달·매장 › 매장 › 매장 공지」 (`/admin/stores/owner-notices`) — 설계 v3.2 §3-4 · Owner 2026-11-10.
 * 사장님 전용 운영 공지(app_notices audience ≠ all) 목록. 작성·수정 = 같은 공지 폼(매장 공지 종류).
 * 조회 = 활성 관리자 전원 · 작성/수정 = business 키(`/admin/stores` 접근표 action) · 알림 발송 = 최고관리자.
 */
export function AdminStoreOwnerNoticesPage() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const searchParams = useSearchParams();
  const writeAction = useAdminRouteAction(ADMIN_OWNER_NOTICES_PATH);
  const [rows, setRows] = useState<AdminOwnerNoticeListRow[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | undefined>(undefined);
  const [reloadKey, setReloadKey] = useState(0);

  /** 작성·수정 화면에서 저장 + 사장님 알림 후 넘어온 결과 (`?notified=대상.성공.실패` · `?notify_error=코드`) */
  const notifyMsg = useMemo(() => {
    const failCode = (searchParams?.get("notify_error") ?? "").trim().slice(0, 60);
    if (failCode) return t("admin_app_notice_notify_owners_failed", { code: failCode });
    const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(searchParams?.get("notified") ?? "");
    if (!m) return null;
    return t("admin_app_notice_notify_owners_result", { recipients: m[1], sent: m[2], failed: m[3] });
  }, [searchParams, t]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await fetch("/api/admin/stores/owner-notices", { credentials: "include", cache: "no-store" });
        const json = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          rows?: AdminOwnerNoticeListRow[];
          truncated?: boolean;
        } | null;
        if (cancelled) return;
        if (!res.ok || !json?.ok) {
          setError(json?.error ?? "load_failed");
          setErrorStatus(res.status);
          return;
        }
        setRows(Array.isArray(json.rows) ? json.rows : []);
        setTruncated(json.truncated === true);
      } catch {
        if (!cancelled) setError("network_error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const reload = useCallback(() => setReloadKey((n) => n + 1), []);

  return (
    <div className="space-y-4" data-admin-store-owner-notices="1">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 [&>[data-admin-page-header]]:mb-0">
          <AdminPageHeader titleKey="admin_menu_store_owner_notices" descriptionKey="admin_owner_notices_page_desc" />
        </div>
        {writeAction.allowed ? (
          <AdminActionLink href={adminOwnerNoticeCreatePath()} variant="primary">
            {t("admin_app_add")}
          </AdminActionLink>
        ) : null}
      </div>
      {notifyMsg ? (
        <p className="text-[13px] text-sam-fg" data-admin-owner-notice-notify-result>
          {notifyMsg}
        </p>
      ) : null}
      {truncated ? (
        <p className="text-[12px] text-sam-muted">
          {t("admin_owner_notices_truncated", { count: ADMIN_OWNER_NOTICES_LIST_MAX })}
        </p>
      ) : null}
      {loading ? (
        <AdminLoadingState ko={ko} label={t("admin_dashboard_loading")} />
      ) : error ? (
        <AdminErrorState ko={ko} code={error} httpStatus={errorStatus} onRetry={reload} />
      ) : rows.length === 0 ? (
        <AdminEmptyState ko={ko} message={t("admin_owner_notices_empty")} />
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="min-w-full divide-y divide-sam-border-soft">
            <thead>
              <tr>
                <th className={TH}>{t("admin_owner_notices_col_pinned")}</th>
                <th className={TH}>{t("admin_owner_notices_col_title")}</th>
                <th className={TH}>{t("admin_app_notice_audience_label")}</th>
                <th className={TH}>{t("admin_owner_notices_col_state")}</th>
                <th className={TH}>{t("admin_owner_notices_col_published_at")}</th>
                <th className={TH}>{t("admin_owner_notices_col_reads")}</th>
                <th className={TH}>{t("admin_owner_notices_col_notify")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sam-border-soft">
              {rows.map((r) => (
                <tr key={r.id} data-admin-owner-notice-row={r.id}>
                  <td className={TD}>
                    {r.isPinned ? <AdminToneBadge tone="progress">{t("owner_announcements_pinned")}</AdminToneBadge> : "—"}
                  </td>
                  <td className={`${TD} min-w-[200px]`}>
                    <Link
                      href={adminOwnerNoticeEditPath(r.id)}
                      className="font-medium text-sam-fg hover:underline"
                    >
                      {r.title || "—"}
                    </Link>
                  </td>
                  <td className={`${TD} whitespace-nowrap`}>{t(APP_NOTICE_AUDIENCE_LABEL_KEY[r.audience])}</td>
                  <td className={`${TD} whitespace-nowrap`}>
                    <AdminToneBadge tone={STATE_TONE[r.publishState]}>
                      {t(ADMIN_OWNER_NOTICE_PUBLISH_STATE_LABEL_KEY[r.publishState])}
                    </AdminToneBadge>
                  </td>
                  <td className={`${TD} whitespace-nowrap`}>
                    <span className="block tabular-nums">{formatAdminManilaDateTime(r.publishedAt)}</span>
                    {r.startsAt || r.endsAt ? (
                      <span className="block text-[12px] text-sam-muted tabular-nums">
                        {t("admin_owner_notices_period", {
                          start: r.startsAt ? formatAdminManilaDateTime(r.startsAt) : "—",
                          end: r.endsAt ? formatAdminManilaDateTime(r.endsAt) : "—",
                        })}
                      </span>
                    ) : null}
                  </td>
                  <td className={`${TD} whitespace-nowrap tabular-nums`}>
                    {`${r.readCount ?? "—"} / ${r.targetCount ?? "—"}`}
                  </td>
                  <td className={`${TD} whitespace-nowrap`}>
                    {r.notify ? (
                      <>
                        <span className="block tabular-nums">
                          {t("admin_owner_notices_notify_cell", {
                            recipients: String(r.notify.recipients),
                            sent: String(r.notify.sent),
                            failed: String(r.notify.failed),
                          })}
                        </span>
                        <span className="block text-[12px] text-sam-muted tabular-nums">
                          {formatAdminManilaDateTime(r.notify.at)}
                        </span>
                      </>
                    ) : r.notifyUnknown ? (
                      "—"
                    ) : (
                      <span className="text-sam-muted">{t("admin_owner_notices_notify_none")}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[12px] text-sam-muted">{t("admin_owner_notices_reads_help")}</p>
    </div>
  );
}
