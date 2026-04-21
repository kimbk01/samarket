"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { isAdminUser } from "@/lib/auth/get-current-user";
import { getAdminChatRoomsFromDb } from "@/lib/admin-chats/getAdminChatRoomsFromDb";
import {
  fetchAdminChatRoomsApi,
  fetchAdminChatRoomsListApi,
} from "@/lib/admin-chats/fetchAdminChatRoomsApi";
import {
  filterAndSortChatRooms,
  type AdminChatFilters,
} from "@/lib/admin-chats/admin-chat-utils";
import type { AdminChatRoom } from "@/lib/types/admin-chat";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminChatFilterBar } from "./AdminChatFilterBar";
import { AdminChatTable } from "./AdminChatTable";

type AdminMergeSource = "chat_rooms" | "product_chats";
type TaggedAdminRoom = AdminChatRoom & { _mergeSource: AdminMergeSource };

/** 거래채팅: 동일 글·동일 판매자·동일 구매자면 한 건으로 본다 (레거시 product_chats vs 통합 chat_rooms 이중 기록 방지) */
function itemTradeTripleKey(r: AdminChatRoom): string | null {
  const pid = (r.productId ?? "").trim();
  const sid = (r.sellerId ?? "").trim();
  const bid = (r.buyerId ?? "").trim();
  if (!pid || !sid || !bid) return null;
  return `${pid}\u0001${sid}\u0001${bid}`;
}

function isItemTradeAdminRoom(r: AdminChatRoom): boolean {
  return r.roomType === "item_trade" || Boolean(itemTradeTripleKey(r));
}

function pickPreferredAdminRoom(a: TaggedAdminRoom, b: TaggedAdminRoom): TaggedAdminRoom {
  const rank = (s: AdminMergeSource) => (s === "chat_rooms" ? 2 : 1);
  if (rank(a._mergeSource) !== rank(b._mergeSource)) {
    return rank(a._mergeSource) > rank(b._mergeSource) ? a : b;
  }
  const ta = new Date(a.lastMessageAt).getTime();
  const tb = new Date(b.lastMessageAt).getTime();
  if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) {
    return ta >= tb ? a : b;
  }
  return (a.messageCount ?? 0) >= (b.messageCount ?? 0) ? a : b;
}

function mergeChatRoomsForAdmin(
  fromProductChats: AdminChatRoom[],
  fromChatRooms: AdminChatRoom[]
): AdminChatRoom[] {
  const tagged: TaggedAdminRoom[] = [
    ...fromChatRooms.map((r) => ({
      ...r,
      adminChatStorage: "chat_rooms" as const,
      _mergeSource: "chat_rooms" as const,
    })),
    ...fromProductChats.map((r) => ({
      ...r,
      adminChatStorage: "product_chats" as const,
      _mergeSource: "product_chats" as const,
    })),
  ];

  const byTradeKey = new Map<string, TaggedAdminRoom>();
  const byOtherId = new Map<string, TaggedAdminRoom>();

  for (const row of tagged) {
    if (isItemTradeAdminRoom(row)) {
      const k = itemTradeTripleKey(row);
      if (k) {
        const prev = byTradeKey.get(k);
        byTradeKey.set(k, prev ? pickPreferredAdminRoom(prev, row) : row);
        continue;
      }
    }
    const prev = byOtherId.get(row.id);
    byOtherId.set(row.id, prev ? pickPreferredAdminRoom(prev, row) : row);
  }

  const untag = ({ _mergeSource, ...r }: TaggedAdminRoom): AdminChatRoom => r;

  return [...byTradeKey.values(), ...byOtherId.values()].map(untag);
}

function storageForBulkDelete(r: AdminChatRoom): "chat_rooms" | "product_chats" {
  if (r.adminChatStorage === "product_chats") return "product_chats";
  return "chat_rooms";
}

/** 전체 / 거래 / 신고 / 업체 / 커뮤니티 / 모임 — 채팅관리 메뉴와 1:1 분리 */
export type ChatListMode = "all" | "trade" | "reported" | "business" | "community" | "group";

const DEFAULT_FILTERS: AdminChatFilters = {
  roomStatus: "",
  roomType: "",
  reportedOnly: false,
  sortKey: "lastMessage",
};

function getInitialFilters(mode: ChatListMode): AdminChatFilters {
  if (mode === "trade") return { ...DEFAULT_FILTERS, roomType: "item_trade" };
  if (mode === "reported") return { ...DEFAULT_FILTERS, reportedOnly: true };
  if (mode === "business") return DEFAULT_FILTERS;
  if (mode === "community") return { ...DEFAULT_FILTERS, roomType: "community" };
  /** 모임·게시판(chat_rooms group) + 모임 오픈채팅을 한 화면에 표시 */
  if (mode === "group") return DEFAULT_FILTERS;
  return DEFAULT_FILTERS;
}

function getTitle(mode: ChatListMode): string {
  if (mode === "trade") return "거래채팅";
  if (mode === "reported") return "신고채팅";
  if (mode === "business" || mode === "community" || mode === "group") return "제거된 채팅";
  return "전체채팅";
}

interface AdminChatListPageProps {
  /** 전체 / 거래 / 신고 / 업체 — 메뉴별 분리 */
  mode?: ChatListMode;
}

export function AdminChatListPage({ mode = "all" }: AdminChatListPageProps) {
  const { t, tt } = useI18n();
  const [filters, setFilters] = useState<AdminChatFilters>(() => getInitialFilters(mode));
  const [searchQuery, setSearchQuery] = useState("");
  const [rooms, setRooms] = useState<AdminChatRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [listHiddenIds, setListHiddenIds] = useState<Set<string>>(() => new Set());
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    setFilters(getInitialFilters(mode));
    setSelectedIds(new Set());
    setListHiddenIds(new Set());
  }, [mode]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const user = getCurrentUser();

    const load = async () => {
      let fromProductChats: AdminChatRoom[] = [];
      let fromChatRooms: AdminChatRoom[] = [];
      const admin = isAdminUser(user);
      const emptyRooms = Promise.resolve([] as AdminChatRoom[]);

      if (mode === "trade") {
        [fromProductChats, fromChatRooms] = await Promise.all([
          admin ? fetchAdminChatRoomsApi().catch(() => []) : emptyRooms,
          fetchAdminChatRoomsListApi({ roomType: "item_trade" }).catch(() => []),
        ]);
      } else if (mode === "reported") {
        [fromProductChats, fromChatRooms] = await Promise.all([
          admin ? fetchAdminChatRoomsApi().catch(() => []) : emptyRooms,
          fetchAdminChatRoomsListApi({ hasReport: true }).catch(() => []),
        ]);
        fromProductChats = fromProductChats.filter((r) => (r.reportCount ?? 0) > 0);
      } else if (mode === "business" || mode === "community" || mode === "group") {
        fromChatRooms = [];
      } else {
        [fromProductChats, fromChatRooms] = await Promise.all([
          admin ? fetchAdminChatRoomsApi().catch(() => []) : emptyRooms,
          fetchAdminChatRoomsListApi().catch(() => []),
        ]);
      }

      const merged = [...mergeChatRoomsForAdmin(fromProductChats, fromChatRooms)].filter(
        (r) =>
          (r.messageCount ?? 0) > 0 ||
          (r.lastMessage ?? "").trim() !== ""
      )
        .sort((a, b) => {
          const ta = new Date(a.lastMessageAt).getTime();
          const tb = new Date(b.lastMessageAt).getTime();
          return tb - ta;
        });
      if (cancelled) return;
      if (merged.length > 0) {
        setRooms(merged);
        return;
      }
      if (mode === "all" || mode === "trade") {
        const fromDb = await getAdminChatRoomsFromDb().catch(() => []);
        if (cancelled) return;
        const list = mode === "trade" ? fromDb.filter((r) => r.roomType === "item_trade") : fromDb;
        setRooms(list.length > 0 ? list : []);
      } else {
        setRooms([]);
      }
    };

    load().catch(() => {
      if (!cancelled) setRooms([]);
    })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, reloadToken]);

  const filtered = useMemo(
    () => filterAndSortChatRooms(rooms, filters, searchQuery),
    [rooms, filters, searchQuery]
  );

  const visibleFiltered = useMemo(
    () => filtered.filter((r) => !listHiddenIds.has(r.id)),
    [filtered, listHiddenIds]
  );

  const handleToggleRow = useCallback((roomId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(roomId);
      else next.delete(roomId);
      return next;
    });
  }, []);

  const handleToggleAllVisible = useCallback(
    (checked: boolean) => {
      const ids = visibleFiltered.map((r) => r.id);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (checked) {
          ids.forEach((id) => next.add(id));
        } else {
          ids.forEach((id) => next.delete(id));
        }
        return next;
      });
    },
    [visibleFiltered]
  );

  const hideSelectedFromListOnly = useCallback(() => {
    if (selectedIds.size === 0) return;
    setListHiddenIds((prev) => {
      const next = new Set(prev);
      selectedIds.forEach((id) => next.add(id));
      return next;
    });
    setSelectedIds(new Set());
    setActionMessage(t("admin_chat_hidden_list_only"));
  }, [selectedIds, t]);

  const deleteSelectedFromDb = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const ids = [...selectedIds];
    const items = ids
      .map((id) => {
        const r = rooms.find((x) => x.id === id);
        if (!r) return null;
        const storage = storageForBulkDelete(r);
        return { id, storage };
      })
      .filter((x): x is { id: string; storage: "chat_rooms" | "product_chats" } => x != null);

    if (items.length === 0) {
      setActionMessage(t("admin_chat_no_deletable_rooms"));
      return;
    }

    if (
      !window.confirm(
        t("admin_chat_delete_confirm", { count: items.length })
      )
    ) {
      return;
    }

    setActionBusy(true);
    setActionMessage(null);
    try {
      const res = await fetch("/api/admin/chat/rooms/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const data = await res.json().catch(() => ({}));
      const deleted: string[] = Array.isArray(data.deleted) ? data.deleted : [];
      if (!res.ok) {
        setActionMessage(data.error ?? t("admin_chat_delete_failed"));
        return;
      }
      const deletedSet = new Set(deleted);
      setRooms((prev) => prev.filter((r) => !deletedSet.has(r.id)));
      setListHiddenIds((prev) => {
        const next = new Set(prev);
        deleted.forEach((id) => next.delete(id));
        return next;
      });
      setSelectedIds((prev) => {
        const next = new Set(prev);
        deleted.forEach((id) => next.delete(id));
        return next;
      });
      if (data.errors?.length) {
        setActionMessage(
          t("admin_chat_done_with_errors", {
            ok: deleted.length,
            failed: data.errors.length,
            errors: data.errors
              .map((e: { id: string; message: string }) => `${e.id.slice(0, 8)}… ${e.message}`)
              .join(" / "),
          })
        );
      } else {
        setActionMessage(t("admin_chat_deleted_count", { count: deleted.length }));
      }
    } catch {
      setActionMessage(t("admin_chat_deleted_network_failed"));
    } finally {
      setActionBusy(false);
    }
  }, [selectedIds, rooms, t]);

  const blockSelectedTradeRooms = useCallback(async () => {
    if (selectedIds.size === 0 || mode !== "trade") return;
    if (
      !window.confirm(
        t("admin_chat_block_confirm", { count: selectedIds.size })
      )
    ) {
      return;
    }
    setActionBusy(true);
    setActionMessage(null);
    const ids = [...selectedIds];
    let ok = 0;
    const errors: string[] = [];
    for (const id of ids) {
      try {
        const res = await fetch(`/api/admin/chat/rooms/${encodeURIComponent(id)}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "block_room", note: t("admin_chat_bulk_list_note") }),
          credentials: "same-origin",
        });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (res.ok && j.ok) ok += 1;
        else errors.push(`${id.slice(0, 8)}… ${j.error ?? res.statusText}`);
      } catch {
        errors.push(`${id.slice(0, 8)}… ${t("common_network_error")}`);
      }
    }
    setSelectedIds(new Set());
    setActionMessage(
      errors.length
        ? t("admin_chat_done_with_errors", { ok, failed: errors.length, errors: errors.join(" / ") })
        : t("admin_chat_bulk_closed", { count: ok })
    );
    setReloadToken((t) => t + 1);
    setActionBusy(false);
  }, [mode, selectedIds, t]);

  const emptyCopy =
    rooms.length === 0
      ? mode === "trade"
        ? t("admin_chat_empty_trade")
        : mode === "reported"
          ? t("admin_chat_empty_reported")
          : mode === "business"
            ? t("admin_chat_empty_business")
            : mode === "community"
              ? t("admin_chat_empty_community")
              : mode === "group"
                ? t("admin_chat_empty_group")
                : t("admin_chat_empty_all")
      : filtered.length === 0
        ? t("admin_chat_empty_filtered")
        : t("admin_chat_empty_hidden_only");

  return (
    <div className="space-y-4">
      <AdminPageHeader title={tt(getTitle(mode))} />
      <AdminChatFilterBar
        filters={filters}
        searchQuery={searchQuery}
        onFiltersChange={setFilters}
        onSearchChange={setSearchQuery}
      />
      {!loading && (filtered.length > 0 || rooms.length > 0) ? (
        <div className="flex flex-wrap items-center gap-2 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary">
          <span className="text-sam-muted">
            {t("admin_chat_selected_summary", {
              selected: selectedIds.size,
              visible: visibleFiltered.length,
            })}
          </span>
          <span className="hidden sm:inline text-sam-meta">|</span>
          <button
            type="button"
            disabled={visibleFiltered.length === 0 || actionBusy}
            onClick={() => handleToggleAllVisible(true)}
            className="rounded border border-sam-border bg-sam-surface px-2.5 py-1.5 font-medium text-sam-fg hover:bg-sam-app disabled:opacity-40"
          >
            {t("admin_chat_select_all_visible")}
          </button>
          <button
            type="button"
            disabled={selectedIds.size === 0 || actionBusy}
            onClick={() => setSelectedIds(new Set())}
            className="rounded border border-sam-border bg-sam-surface px-2.5 py-1.5 font-medium text-sam-fg hover:bg-sam-app disabled:opacity-40"
          >
            {t("admin_chat_clear_selection")}
          </button>
          <button
            type="button"
            disabled={selectedIds.size === 0 || actionBusy}
            onClick={hideSelectedFromListOnly}
            className="rounded border border-amber-200 bg-amber-50 px-2.5 py-1.5 font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-40"
          >
            {t("admin_chat_remove_list_only")}
          </button>
          {mode === "trade" ? (
            <button
              type="button"
              disabled={selectedIds.size === 0 || actionBusy}
              onClick={() => void blockSelectedTradeRooms()}
              className="rounded border border-red-300 bg-red-100 px-2.5 py-1.5 font-medium text-red-900 hover:bg-red-200 disabled:opacity-40"
            >
              {t("admin_chat_close_selected_ops")}
            </button>
          ) : null}
          <button
            type="button"
            disabled={selectedIds.size === 0 || actionBusy}
            onClick={() => void deleteSelectedFromDb()}
            className="rounded border border-red-200 bg-red-50 px-2.5 py-1.5 font-medium text-red-800 hover:bg-red-100 disabled:opacity-40"
          >
            {t("admin_chat_delete_from_db")}
          </button>
        </div>
      ) : null}
      {actionMessage ? (
        <p className="rounded border border-sam-border bg-sam-app px-3 py-2 sam-text-body-secondary text-sam-fg">
          {actionMessage}
        </p>
      ) : null}
      {loading ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          {t("admin_chat_loading_room")}
        </div>
      ) : visibleFiltered.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          {emptyCopy}
        </div>
      ) : (
        <AdminChatTable
          rooms={visibleFiltered}
          selectedIds={selectedIds}
          onToggleRow={handleToggleRow}
          onToggleAllVisible={handleToggleAllVisible}
        />
      )}
    </div>
  );
}
