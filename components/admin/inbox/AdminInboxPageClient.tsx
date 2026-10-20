"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  ADMIN_INBOX_CHANGED_EVENT,
  isSettlementAdminNotificationKind,
  type AdminNotificationDto,
  type AdminNotificationWorkState,
} from "@/lib/admin/notifications/admin-notification-kinds";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { MemberOpsListBody } from "@/components/admin/member-ops/MemberOpsListBody";
import { useMemberOpsPagedFetch } from "@/lib/admin/member-ops-list/use-member-ops-paged-fetch";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";

/** Settlement alerts: work state colour + text (light/dark tokens). Read state is shown separately. */
const WORK_STATE_ROW: Record<AdminNotificationWorkState, string> = {
  pending: "border-l-4 border-l-sam-warning",
  done: "border-l-4 border-l-sam-success",
  attention: "border-l-4 border-l-sam-danger",
};
const WORK_STATE_BADGE: Record<AdminNotificationWorkState, string> = {
  pending: "bg-sam-warning-soft text-sam-warning",
  done: "bg-sam-success-soft text-sam-success",
  attention: "bg-sam-danger-soft text-sam-danger",
};

function emitInboxChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(ADMIN_INBOX_CHANGED_EVENT));
}

/** `useSearchParams` 사용 — Suspense 경계 안에서 그린다. */
export function AdminInboxPageClient() {
  return (
    <Suspense fallback={null}>
      <AdminInboxPageInner />
    </Suspense>
  );
}

const INBOX_EXTRAS = ["unread"] as const;

/**
 * /admin/inbox — R13 ADMIN NOTIFICATION inbox (caller's own rows only).
 * Read ≠ resolved: opening or marking read never changes the linked work item.
 * R7 — 「안 읽은 것만」은 주소(`?unread=1`)에 남고, 서버 페이지(20/50/100 + 총 건수). 예전 30건 「더 보기」 대체.
 */
function AdminInboxPageInner() {
  const { t, language } = useI18n();
  const lq = useAdminListQuery<(typeof INBOX_EXTRAS)[number]>({ extras: INBOX_EXTRAS });
  const unreadOnly = lq.query.extras.unread === "1";
  const list = useMemberOpsPagedFetch<AdminNotificationDto>(`/api/admin/inbox?${lq.apiQueryString}`, "items", lq.refreshKey);
  const items = list.rows;
  const unread = typeof list.json?.unread === "number" ? list.json.unread : 0;
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(false);

  const [delivery, setDelivery] = useState<{
    outboxDead?: number;
    outboxPending?: number;
    pushDead?: number;
    pushUnknown?: number;
    unavailable?: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/admin/inbox?summary=1", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((j: { delivery?: typeof delivery }) => {
        if (!cancelled) setDelivery(j?.delivery ?? null);
      })
      .catch(() => {
        if (!cancelled) setDelivery(null);
      });
    return () => {
      cancelled = true;
    };
  }, [lq.refreshKey]);

  const reload = lq.refresh;

  const markRead = async (body: { ids?: string[]; all?: boolean }) => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/inbox/read", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (!res.ok || !json.ok) {
        setActionError(true);
        return;
      }
      setActionError(false);
      emitInboxChanged();
      reload();
    } catch {
      setActionError(true);
    } finally {
      setBusy(false);
    }
  };

  const ko = language !== "en";

  const markAllRead = async () => {
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("save"),
      ko,
      title: t("admin_inbox_mark_all_read"),
      description: ko
        ? `안 읽은 알림 ${formatAdminNumber(unread)}건을 읽음으로 표시합니다. 연결된 업무 상태는 바뀌지 않습니다.`
        : `Marks ${formatAdminNumber(unread)} unread notifications as read. Linked work items do not change.`,
      confirmLabel: t("admin_inbox_mark_all_read"),
    });
    if (!confirmed.ok) return;
    await markRead({ all: true });
  };

  return (
    <div className="space-y-4 p-4 md:p-6" data-testid="admin-inbox-page">
      <AdminPageHeader titleKey="admin_inbox_title" descriptionKey="admin_inbox_desc" />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <AdminFilterBar
          ko={ko}
          draft={lq.draft}
          onDraftChange={lq.setDraft}
          onSubmit={lq.submit}
          onReset={lq.reset}
          pending={list.loading}
          showPeriod={false}
          showSearch={false}
          className="flex-1"
        >
          <label className="flex h-10 items-center gap-2 text-[14px] text-sam-muted">
            <input
              id="admin-inbox-unread-only"
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => lq.setExtra("unread", e.target.checked ? "1" : "")}
            />
            {t("admin_inbox_unread_only")}
          </label>
        </AdminFilterBar>
        <AdminActionButton
          variant="secondary"
          size="sm"
          disabled={busy || unread === 0}
          onClick={() => void markAllRead()}
        >
          {t("admin_inbox_mark_all_read")} ({formatAdminNumber(unread)})
        </AdminActionButton>
      </div>
      {actionError ? (
        <p className="text-sm text-sam-danger" role="alert">
          {t("admin_inbox_load_error")}
        </p>
      ) : null}
      {delivery &&
      (delivery.unavailable || (delivery.outboxDead ?? 0) > 0 || (delivery.pushDead ?? 0) > 0) ? (
        <div
          className="rounded-ui-rect border border-sam-danger bg-sam-danger-soft px-3 py-2 text-sm text-sam-danger"
          role="alert"
          data-testid="admin-inbox-delivery-failure"
        >
          {delivery.unavailable
            ? t("admin_inbox_delivery_health_unavailable")
            : `${t("admin_inbox_delivery_failed")} · outbox ${formatAdminNumber(delivery.outboxDead ?? 0)} · push ${formatAdminNumber(delivery.pushDead ?? 0)}`}
        </div>
      ) : null}
      <MemberOpsListBody
        ko={ko}
        loading={list.loading}
        loaded={list.loaded}
        error={list.error}
        onRetry={reload}
        rowCount={items.length}
        total={list.total}
        page={lq.query.page}
        size={lq.query.size}
        onPageChange={lq.setPage}
        onSizeChange={lq.setSize}
        isFiltered={lq.isFiltered}
        onReset={lq.reset}
        emptyMessage={t("admin_inbox_empty")}
      >
        <ul className="divide-y divide-sam-border rounded-ui-rect border border-sam-border bg-sam-surface">
          {items.map((n) => (
            <li
              key={n.id}
              className={`flex flex-col gap-1 px-4 py-3 ${n.readAt ? "" : "bg-sam-app"} ${
                n.workStatus ? WORK_STATE_ROW[n.workStatus.state] : ""
              }`}
              data-admin-inbox-item={n.id}
              data-read={n.readAt ? "1" : "0"}
              data-kind={n.kind}
              data-work-state={n.workStatus?.state ?? ""}
            >
              {isSettlementAdminNotificationKind(n.kind) ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {n.workStatus ? (
                    <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${WORK_STATE_BADGE[n.workStatus.state]}`} data-work-label="1">
                      {language === "en" ? n.workStatus.labelEn : n.workStatus.labelKo}
                    </span>
                  ) : null}
                  <span className="rounded-full bg-sam-surface-muted px-2 py-0.5 text-[12px] text-sam-muted" data-read-label="1">
                    {n.readAt ? (language === "en" ? "Read" : "읽음") : language === "en" ? "Unread" : "안 읽음"}
                  </span>
                </div>
              ) : null}
              <div className="flex items-start justify-between gap-3">
                <p className={`break-words text-sm text-sam-fg ${n.readAt ? "" : "font-semibold"}`}>{n.title}</p>
                <time className="shrink-0 text-xs tabular-nums text-sam-muted" dateTime={n.createdAt}>
                  {formatAdminManilaDateTime(n.createdAt)}
                </time>
              </div>
              {n.body ? (
                <p className={`text-sm text-sam-muted ${isSettlementAdminNotificationKind(n.kind) ? "break-words" : "line-clamp-2"}`}>{n.body}</p>
              ) : null}
              <div className="flex gap-3 text-xs">
                {n.linkUrl ? (
                  <Link
                    href={n.linkUrl}
                    className="font-medium text-signature underline"
                    onClick={() => {
                      if (!n.readAt) void markRead({ ids: [n.id] });
                    }}
                  >
                    {t("admin_inbox_open_work")}
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </MemberOpsListBody>
    </div>
  );
}
