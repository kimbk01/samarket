"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bell, MoreHorizontal } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayActionSheet } from "@/components/ui/dibay-overlay";
import { NotificationDeleteConfirmDialog } from "@/components/notifications/NotificationDeleteConfirmDialog";
import { NotificationInboxByDateSections } from "@/components/notifications/NotificationInboxByDateSections";
import { NotificationInboxRowSkeleton } from "@/components/notifications/NotificationInboxRowSkeleton";
import { resolveOwnerApiErrorMessage } from "@/lib/business/owner-api-error-i18n";
import {
  KASAMA_NOTIFICATIONS_UPDATED,
  NOTIFICATION_SYNC_POLL_MS,
} from "@/lib/notifications/notification-events";
import {
  fetchMeOwnerStoreNotificationsDeduped,
  invalidateMeOwnerStoreNotificationsCache,
} from "@/lib/me/fetch-me-owner-store-notifications";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { DIBAY_STATUS_TABS_CLASS, dibaySecondaryTabClass } from "@/lib/ui/dibay-secondary-tabs";
import {
  OWNER_NOTIF_GROUPS,
  OWNER_NOTIF_TABS,
  filterOwnerNotificationRows,
  ownerRowToInboxItem,
  parseOwnerNotifTab,
  type OwnerNotifTab,
  type OwnerNotificationRow as Row,
} from "@/components/stores/owner/owner-notification-inbox-items";

/** 서버 `PATCH /api/me/notifications` 의 `delete_ids` 상한 (DELETE_IDS_CAP) */
const DELETE_IDS_CHUNK = 200;

async function patchNotifications(body: Record<string, unknown>): Promise<boolean> {
  const res = await fetch("/api/me/notifications", {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean };
  return res.ok && j?.ok === true;
}

/** 오너 행 id 만 200개씩 소프트 삭제. 반환 = 삭제 성공한 id (실패 청크에서 중단). */
async function deleteIdsInChunks(ids: string[]): Promise<{ deleted: string[]; failed: boolean }> {
  const deleted: string[] = [];
  for (let i = 0; i < ids.length; i += DELETE_IDS_CHUNK) {
    const chunk = ids.slice(i, i + DELETE_IDS_CHUNK);
    let ok = false;
    try {
      ok = await patchNotifications({ delete_ids: chunk });
    } catch {
      ok = false;
    }
    if (!ok) return { deleted, failed: true };
    deleted.push(...chunk);
  }
  return { deleted, failed: false };
}

/**
 * 오너 매장 알림 목록 — 회원 알림센터(`MyNotificationsView` + `/notifications`)와 같은 공용 목록·탭·선택·삭제 규칙.
 * 데이터 = `GET /api/me/notifications?owner_store_id=` (이 매장 오너 행만). 읽음·삭제 = 불러온 오너 행 id 만.
 */
export function OwnerNotificationList({
  slug: _slug,
  storeId,
}: {
  slug: string;
  storeId: string;
}) {
  const { t, language } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = parseOwnerNotifTab(searchParams?.get("tab"));

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markBusy, setMarkBusy] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[] | null>(null);
  const [bulkConfirm, setBulkConfirm] = useState<"read_delete" | "all_delete" | null>(null);
  const bulkConfirmRef = useRef(bulkConfirm);
  bulkConfirmRef.current = bulkConfirm;
  const [menuOpen, setMenuOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  /** 개별 읽음·전체 읽음·삭제 실패 토스트 (회원 목록과 같은 3초·같은 위치) */
  const [actionError, setActionError] = useState(false);
  useEffect(() => {
    if (!actionError) return;
    const timer = setTimeout(() => setActionError(false), 3000);
    return () => clearTimeout(timer);
  }, [actionError]);

  const load = useCallback(
    async (silent = false, force = false) => {
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const { status, json } = await fetchMeOwnerStoreNotificationsDeduped(storeId, { force });
        const j = json as { ok?: boolean; notifications?: Row[]; error?: string };
        if (status === 401) {
          setError("login_required");
          setRows([]);
          return;
        }
        if (!j?.ok) {
          if (!silent) {
            setError(typeof j?.error === "string" ? j.error : "load_failed");
            setRows([]);
          }
          return;
        }
        setRows((j.notifications ?? []) as Row[]);
        setError(null);
      } catch {
        if (!silent) {
          setError("network_error");
          setRows([]);
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [storeId]
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    const onUpdated = () => void load(true, true);
    window.addEventListener(KASAMA_NOTIFICATIONS_UPDATED, onUpdated);
    return () => window.removeEventListener(KASAMA_NOTIFICATIONS_UPDATED, onUpdated);
  }, [load]);

  useEffect(() => {
    let id: ReturnType<typeof setInterval> | undefined;
    const tick = () => {
      if (document.visibilityState === "visible") void load(true, true);
    };
    const arm = () => {
      if (id != null) clearInterval(id);
      id = setInterval(tick, NOTIFICATION_SYNC_POLL_MS);
    };
    const onVis = () => {
      if (document.visibilityState === "visible") {
        void load(true, true);
        arm();
      } else if (id != null) {
        clearInterval(id);
        id = undefined;
      }
    };
    arm();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      if (id != null) clearInterval(id);
    };
  }, [load]);

  useRefetchOnPageShowRestore(() => void load(true, true), { enableVisibilityRefetch: false });

  const filtered = useMemo(() => filterOwnerNotificationRows(rows, tab), [rows, tab]);

  const items = useMemo(
    () =>
      filtered.map((r) =>
        ownerRowToInboxItem(r, storeId, language, (orderNo) =>
          t("store_owner_notif_order_no_label", { orderNo })
        )
      ),
    [filtered, storeId, language, t]
  );

  const tabUnread = useMemo(() => {
    const out: Record<OwnerNotifTab, number> = { all: 0, new_orders: 0, cancel_payment: 0, refund: 0 };
    for (const r of rows) {
      if (r.is_read) continue;
      out.all += 1;
      for (const g of OWNER_NOTIF_GROUPS) if (g.match(r)) out[g.id] += 1;
    }
    return out;
  }, [rows]);

  const broadcast = useCallback(() => {
    window.dispatchEvent(new Event(KASAMA_NOTIFICATIONS_UPDATED));
  }, []);

  const afterMutation = useCallback(() => {
    invalidateMeOwnerStoreNotificationsCache(storeId);
    broadcast();
  }, [broadcast, storeId]);

  const exitSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  /** 탭 = URL `?tab=` (뒤로가기 복귀 시 유지). storeId 등 다른 쿼리는 보존. */
  const selectTab = useCallback(
    (next: OwnerNotifTab) => {
      const sp = new URLSearchParams(searchParams?.toString() ?? "");
      if (next === "all") sp.delete("tab");
      else sp.set("tab", next);
      const q = sp.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
      setSelectedIds(new Set());
    },
    [pathname, router, searchParams]
  );

  const markIdsRead = useCallback(
    async (ids: string[], flightKey: string): Promise<boolean> => {
      if (ids.length === 0) return true;
      try {
        const ok = await runSingleFlight(flightKey, () => patchNotifications({ ids }));
        if (!ok) {
          setActionError(true);
          return false;
        }
        const set = new Set(ids);
        setRows((prev) => prev.map((x) => (set.has(x.id) ? { ...x, is_read: true } : x)));
        afterMutation();
        return true;
      } catch {
        setActionError(true);
        return false;
      }
    },
    [afterMutation]
  );

  const onActivate = useCallback(
    (href: string, row: Row | undefined) => {
      if (row && !row.is_read) {
        void markIdsRead([row.id], `store-owner:notifications:mark-read:${row.id}`);
      }
      if (/^https?:\/\//i.test(href)) {
        window.location.assign(href);
        return;
      }
      router.push(href);
    },
    [markIdsRead, router]
  );

  /**
   * 「모두 읽음」 = 현재 탭의 불러온 미읽음 오너 행 id (회원 「범위 = 현재 탭」 규칙).
   * 서버 `mark_all_owner_store_commerce_read` 는 매장 구분 없이 사용자 전체 오너 알림을 읽음 처리하므로
   * 매장별 화면에서는 쓰지 않는다.
   */
  const markTabRead = async () => {
    const unread = filtered.filter((r) => !r.is_read).map((r) => r.id);
    if (unread.length === 0) return;
    setMarkBusy(true);
    try {
      await markIdsRead(unread, `store-owner:notifications:mark-read-all:${[...unread].sort().join(",")}`);
    } finally {
      setMarkBusy(false);
    }
  };

  const markSelectedRead = async () => {
    const ids = filtered.filter((r) => selectedIds.has(r.id) && !r.is_read).map((r) => r.id);
    if (ids.length === 0) {
      setSelectedIds(new Set());
      return;
    }
    setActionBusy(true);
    try {
      const ok = await markIdsRead(ids, `store-owner:notifications:mark-read-selected:${[...ids].sort().join(",")}`);
      if (ok) setSelectedIds(new Set());
    } finally {
      setActionBusy(false);
    }
  };

  const runDelete = async (ids: string[], opts?: { refetch?: boolean }) => {
    if (ids.length === 0) return;
    setActionBusy(true);
    try {
      const { deleted, failed } = await deleteIdsInChunks(ids);
      if (deleted.length > 0) {
        const set = new Set(deleted);
        setRows((prev) => prev.filter((x) => !set.has(x.id)));
        afterMutation();
      }
      if (failed) {
        setActionError(true);
        return;
      }
      exitSelection();
      /** 목록 상한(200건) 밖 오래된 행이 남아 있으면 다시 불러와 보여 준다 */
      if (opts?.refetch) void load(true, true);
    } finally {
      setActionBusy(false);
      setPendingDeleteIds(null);
      setBulkConfirm(null);
    }
  };

  const runBulkDelete = (mode: "read_delete" | "all_delete") => {
    const ids = (mode === "all_delete" ? rows : rows.filter((r) => r.is_read)).map((r) => r.id);
    if (ids.length === 0) {
      setBulkConfirm(null);
      return;
    }
    void runDelete(ids, { refetch: true });
  };

  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const allSelected = selectedIds.size > 0 && selectedIds.size === filtered.length;
  const hasUnreadInTab = tabUnread[tab] > 0;

  if (error === "login_required") {
    return (
      <p className="rounded-ui-rect border border-sam-warning/30 bg-sam-warning-soft p-4 text-sm text-sam-fg">
        {t("store_owner_notif_login_to_view")}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-10 -mx-1 space-y-2 bg-sam-surface/95 px-1 py-2 backdrop-blur-sm">
        {/* 회원 NotificationInboxTabBar 와 같은 탭 기하·뱃지 (오너 탭 키라 공용 컴포넌트 타입 밖) */}
        <div
          className={DIBAY_STATUS_TABS_CLASS}
          role="tablist"
          aria-label={t("notif_center_tabs_aria")}
          data-dibay-nav="status"
        >
          {OWNER_NOTIF_TABS.map((key) => {
            const selected = tab === key;
            const label =
              key === "all"
                ? t("store_owner_notif_tab_all")
                : t(OWNER_NOTIF_GROUPS.find((g) => g.id === key)!.labelKey);
            const count = tabUnread[key];
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-label={count > 0 ? t("notif_center_tab_unread_aria", { label, n: count }) : undefined}
                onClick={() => {
                  if (!selected) selectTab(key);
                }}
                className={dibaySecondaryTabClass(selected)}
              >
                <span>{label}</span>
                {count > 0 ? (
                  <span
                    aria-hidden
                    className="ml-1.5 inline-flex min-w-[1.15rem] items-center justify-center rounded-full bg-sam-danger px-1.5 py-0.5 text-[10px] font-bold leading-none text-sam-on-primary tabular-nums"
                  >
                    {count > 99 ? "99+" : count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {selectionMode ? (
          <div
            role="toolbar"
            aria-label={t("notif_center_selection_toolbar")}
            className="flex min-h-9 items-center justify-between gap-2 px-0.5"
          >
            <div className="flex min-w-0 items-center gap-1">
              <button
                type="button"
                disabled={actionBusy}
                onClick={exitSelection}
                className="inline-flex h-8 shrink-0 items-center rounded-ui-rect px-2 text-[13px] font-semibold text-sam-fg transition active:bg-sam-pressed-surface disabled:opacity-40"
              >
                {t("notif_center_cancel_selection")}
              </button>
              <span className="truncate text-[13px] font-semibold text-sam-fg tabular-nums">
                {t("notif_center_selected_n", { n: selectedIds.size })}
              </span>
              <button
                type="button"
                disabled={actionBusy || filtered.length === 0}
                onClick={() =>
                  setSelectedIds(allSelected ? new Set() : new Set(filtered.map((r) => r.id)))
                }
                className="inline-flex h-8 shrink-0 items-center rounded-ui-rect px-2 text-[13px] font-semibold text-sam-primary transition active:bg-sam-primary-soft disabled:opacity-40"
              >
                {allSelected ? t("notif_center_deselect_all") : t("notif_center_select_all")}
              </button>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                disabled={actionBusy || selectedIds.size === 0}
                onClick={() => void markSelectedRead()}
                className="inline-flex h-8 items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface px-3 text-[13px] font-semibold text-sam-fg transition active:bg-sam-pressed-surface disabled:opacity-40"
              >
                {t("notif_center_mark_read_action")}
              </button>
              <button
                type="button"
                disabled={actionBusy || selectedIds.size === 0}
                onClick={() => setPendingDeleteIds([...selectedIds])}
                className="inline-flex h-8 items-center justify-center rounded-ui-rect border border-sam-danger bg-sam-danger px-3 text-[13px] font-semibold text-sam-on-primary transition active:opacity-85 disabled:opacity-40"
              >
                {t("notif_center_delete_n", { n: selectedIds.size })}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex min-h-9 items-center justify-between gap-2 px-0.5">
            <span className="min-w-0 truncate text-[12px] font-medium text-sam-muted tabular-nums">
              {t("notif_center_unread_summary", { n: tabUnread[tab] })}
            </span>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                disabled={markBusy || loading || !hasUnreadInTab}
                title={!hasUnreadInTab ? t("notif_inbox_mark_all_disabled_hint") : undefined}
                onClick={() => void markTabRead()}
                className="inline-flex h-8 shrink-0 items-center justify-center rounded-ui-rect border border-sam-primary bg-sam-surface px-3 text-[13px] font-semibold text-sam-primary transition active:bg-sam-primary-soft disabled:cursor-not-allowed disabled:border-sam-border disabled:text-sam-muted disabled:opacity-60"
              >
                {markBusy ? t("common_processing") : t("notif_tier1_mark_read")}
              </button>
              <button
                type="button"
                disabled={loading}
                aria-label={t("notif_center_more_menu")}
                aria-haspopup="dialog"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen(true)}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface text-sam-fg transition active:bg-sam-pressed-surface disabled:opacity-40"
              >
                <MoreHorizontal className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="min-w-0 overflow-hidden rounded-ui-rect border border-sam-border/55 bg-sam-surface">
          <NotificationInboxRowSkeleton label={t("common_loading")} />
        </div>
      ) : error ? (
        <div role="alert" className="flex flex-col items-center gap-3 px-4 py-10 text-center">
          <p className="text-sm text-sam-danger">{resolveOwnerApiErrorMessage(error, t)}</p>
          <button
            type="button"
            onClick={() => void load(false, true)}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2 text-[13px] font-semibold text-sam-fg transition active:bg-sam-pressed-surface"
          >
            {t("common_retry")}
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center px-4 py-14 text-center">
          <span
            className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-sam-primary-soft text-sam-primary"
            aria-hidden
          >
            <Bell className="h-8 w-8" strokeWidth={2} />
          </span>
          <p className="text-[16px] font-semibold text-sam-fg">{t("store_owner_notif_empty")}</p>
        </div>
      ) : (
        <NotificationInboxByDateSections
          items={items}
          onActivate={(item) => onActivate(item.href, rowById.get(item.notification_id))}
          selectionMode={selectionMode}
          selectedKeys={selectedIds}
          onToggleSelect={(item) =>
            setSelectedIds((prev) => {
              const next = new Set(prev);
              if (next.has(item.key)) next.delete(item.key);
              else next.add(item.key);
              return next;
            })
          }
          onDelete={selectionMode ? undefined : (item) => setPendingDeleteIds([item.notification_id])}
          deleteBusyKey={actionBusy && pendingDeleteIds?.length === 1 ? pendingDeleteIds[0] : null}
          emptyLabel={t("notif_category_empty")}
        />
      )}

      <DibayActionSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={t("notif_center_more_menu")}
        cancelLabel={t("notif_inbox_delete_dialog_cancel")}
        items={[
          {
            key: "select",
            label: t("notif_center_select"),
            disabled: filtered.length === 0,
            onClick: () => setSelectionMode(true),
          },
          {
            key: "read_delete",
            label: t("notif_center_delete_read"),
            disabled: !rows.some((r) => r.is_read),
            onClick: () => setBulkConfirm("read_delete"),
          },
          {
            key: "all_delete",
            label: t("notif_center_delete_all"),
            danger: true,
            disabled: rows.length === 0,
            onClick: () => setBulkConfirm("all_delete"),
          },
        ]}
      />
      <NotificationDeleteConfirmDialog
        open={pendingDeleteIds != null}
        message={
          (pendingDeleteIds?.length ?? 0) > 1
            ? t("notif_center_delete_selected_confirm", { n: pendingDeleteIds?.length ?? 0 })
            : t("notif_inbox_delete_confirm")
        }
        cancelLabel={t("notif_inbox_delete_dialog_cancel")}
        confirmLabel={t("common_delete")}
        busy={actionBusy}
        onCancel={() => setPendingDeleteIds(null)}
        onConfirm={() => {
          if (pendingDeleteIds) void runDelete(pendingDeleteIds);
        }}
      />
      <NotificationDeleteConfirmDialog
        open={bulkConfirm != null}
        message={
          bulkConfirm === "all_delete"
            ? t("notif_center_delete_all_confirm")
            : t("notif_center_delete_read_confirm")
        }
        cancelLabel={t("notif_inbox_delete_dialog_cancel")}
        confirmLabel={t("common_delete")}
        busy={actionBusy}
        onCancel={() => setBulkConfirm(null)}
        onConfirm={() => {
          const mode = bulkConfirmRef.current;
          if (mode) runBulkDelete(mode);
        }}
      />
      {actionError ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 z-[70] flex justify-center px-4"
          style={{ bottom: "calc(76px + var(--safe-bottom, 0px))" }}
        >
          <p className="max-w-[24rem] rounded-ui-rect bg-sam-fg px-4 py-3 text-center text-[13px] font-medium text-sam-surface shadow-lg">
            {t("notif_inbox_error_failed")}
          </p>
        </div>
      ) : null}
    </div>
  );
}
