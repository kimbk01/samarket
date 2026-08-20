"use client";

import { dibayConfirm } from "@/components/ui/dibay-overlay";
import { useMemo, useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
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
import type { MessageKey } from "@/lib/i18n/messages";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminChatFilterBar } from "./AdminChatFilterBar";
import { AdminChatTable } from "./AdminChatTable";
import {
  adminTradeChatDeepLinkActive,
  matchAdminChatRoomToDeepLink,
  parseAdminTradeChatDeepLink,
} from "@/lib/admin-products/admin-trade-deep-link";

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

/**
 * Cut A / S5 — Trade OPS_CHAT authority = product_chats.
 * When the same listing×seller×buyer exists in both stores, prefer product_chats;
 * chat_rooms is fallback only (CM trade room chrome / messenger).
 */
function pickPreferredAdminRoom(a: TaggedAdminRoom, b: TaggedAdminRoom): TaggedAdminRoom {
  const rank = (s: AdminMergeSource) => (s === "product_chats" ? 2 : 1);
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

function getTitleKey(mode: ChatListMode): MessageKey {
  if (mode === "trade") return "admin_chat_list_title_trade";
  if (mode === "reported") return "admin_chat_list_title_reported";
  if (mode === "business" || mode === "community" || mode === "group") return "admin_chat_removed";
  return "admin_chat_list_title_all";
}

interface AdminChatListPageProps {
  /** 전체 / 거래 / 신고 / 업체 — 메뉴별 분리 */
  mode?: ChatListMode;
}

export function AdminChatListPage({ mode = "all" }: AdminChatListPageProps) {
  const { t, safeT } = useI18n();
  const searchParams = useSearchParams();
  const deepLink = useMemo(() => parseAdminTradeChatDeepLink(searchParams), [searchParams]);
  const deepLinkActive = mode === "trade" && adminTradeChatDeepLinkActive(deepLink);
  const fromMessenger = (searchParams.get("from") ?? "").trim().toLowerCase() === "messenger";
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

    const load = async () => {
      let fromProductChats: AdminChatRoom[] = [];
      let fromChatRooms: AdminChatRoom[] = [];

      if (mode === "trade") {
        [fromProductChats, fromChatRooms] = await Promise.all([
          fetchAdminChatRoomsApi().catch(() => []),
          fetchAdminChatRoomsListApi({ roomType: "item_trade" }).catch(() => []),
        ]);
      } else if (mode === "reported") {
        [fromProductChats, fromChatRooms] = await Promise.all([
          fetchAdminChatRoomsApi().catch(() => []),
          fetchAdminChatRoomsListApi({ hasReport: true }).catch(() => []),
        ]);
        fromProductChats = fromProductChats.filter((r) => (r.reportCount ?? 0) > 0);
      } else if (mode === "business" || mode === "community" || mode === "group") {
        fromChatRooms = [];
      } else {
        [fromProductChats, fromChatRooms] = await Promise.all([
          fetchAdminChatRoomsApi().catch(() => []),
          fetchAdminChatRoomsListApi().catch(() => []),
        ]);
      }

      const mergedAll = [...mergeChatRoomsForAdmin(fromProductChats, fromChatRooms)];
      /** Deep-link postId: keep rooms even without messages so listing→chat drill works. */
      const postFocus = mode === "trade" ? deepLink.postId : "";
      const merged = (
        postFocus
          ? mergedAll
          : mergedAll.filter(
              (r) => (r.messageCount ?? 0) > 0 || (r.lastMessage ?? "").trim() !== ""
            )
      ).sort((a, b) => {
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
  }, [mode, reloadToken, deepLink.postId]);

  const filtered = useMemo(
    () => filterAndSortChatRooms(rooms, filters, searchQuery),
    [rooms, filters, searchQuery]
  );

  const deepLinkedFiltered = useMemo(() => {
    if (!deepLinkActive) return filtered;
    return matchAdminChatRoomToDeepLink(filtered, deepLink);
  }, [deepLinkActive, deepLink, filtered]);

  const visibleFiltered = useMemo(
    () => deepLinkedFiltered.filter((r) => !listHiddenIds.has(r.id)),
    [deepLinkedFiltered, listHiddenIds]
  );

  useEffect(() => {
    if (!deepLinkActive || loading) return;
    if (deepLink.roomId) {
      const hit = rooms.find((r) => r.id === deepLink.roomId);
      if (hit) {
        setSelectedIds(new Set([hit.id]));
        return;
      }
    }
    if (visibleFiltered.length === 1) {
      setSelectedIds(new Set([visibleFiltered[0].id]));
    }
  }, [deepLinkActive, deepLink.roomId, loading, rooms, visibleFiltered]);

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
      !(await dibayConfirm({ title: t("admin_chat_delete_confirm", { count: items.length }), confirmTone: "destructive" }))
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
      !(await dibayConfirm({ title: t("admin_chat_block_confirm", { count: selectedIds.size }), confirmTone: "destructive" }))
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

  const focusedRoom = deepLinkActive ? visibleFiltered[0] ?? null : null;

  const emptyCopy =
    rooms.length === 0
      ? mode === "trade"
        ? t("admin_chat_empty_trade")
        : mode === "reported"
          ? t("admin_chat_empty_reported")
          : mode === "business" || mode === "community" || mode === "group"
            ? safeT("admin_chat_hollow_empty", {
                fallbackKo: "HOLLOW — Admin 목록 미연결 (데이터 없음이 아님).",
                fallbackEn: "HOLLOW — Admin list not wired (not a proven empty dataset).",
              })
            : t("admin_chat_empty_all")
      : deepLinkActive && deepLinkedFiltered.length === 0
        ? safeT("admin_trade_deep_link_no_match", {
            fallbackKo: "딥링크 조건에 맞는 거래가 목록에 없습니다.",
            fallbackEn: "No trade in this list matches the deep link.",
          })
        : filtered.length === 0
          ? t("admin_chat_empty_filtered")
          : t("admin_chat_empty_hidden_only");

  const isHollowMessengerMode =
    mode === "business" || mode === "community" || mode === "group";

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey={getTitleKey(mode)} />
      {mode === "trade" ? (
        <div
          className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-helper text-sam-muted"
          data-testid="admin-trade-chat-identity-banner"
          data-admin-chat-authority="product_chats"
        >
          {safeT("admin_trade_chat_identity_banner", {
            fallbackKo:
              "Trade OPS identity: product_chats 우선 · 동일 listing×seller×buyer 이면 chat_rooms는 fallback · Community Messenger trade room UUID는 별도(혼동 금지).",
            fallbackEn:
              "Trade OPS identity: prefer product_chats; chat_rooms is fallback for the same listing×seller×buyer; CM trade room UUIDs are separate — do not mix.",
          })}
        </div>
      ) : null}
      {mode === "trade" && fromMessenger ? (
        <div
          className="rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 sam-text-helper text-amber-950"
          data-testid="admin-messenger-trade-reference-banner"
          data-admin-entry="messenger-reference"
        >
          {safeT("admin_messenger_trade_reference_banner", {
            fallbackKo:
              "REFERENCE · Messenger 메뉴 진입입니다. Trade 채팅 Authority는 Trade Domain(/admin/chats/trade)입니다. Messenger는 소유·생성하지 않습니다.",
            fallbackEn:
              "REFERENCE · Entered from Messenger menu. Trade chat authority stays on Trade (/admin/chats/trade). Messenger does not own or create rooms.",
          })}
        </div>
      ) : null}
      {isHollowMessengerMode ? (
        <div
          className="rounded-ui-rect border border-amber-300 bg-amber-50 px-3 py-2 sam-text-helper text-amber-950"
          data-admin-surface="hollow"
          data-testid="admin-chat-hollow-banner"
        >
          {safeT("admin_chat_hollow_banner", {
            fallbackKo:
              "HOLLOW · 이 Messenger Admin mode는 목록 writer가 연결되지 않았습니다. 빈 목록을 PASS로 보지 마세요. 실제 운영은 /admin/chats/messenger 또는 도메인별 메신저 경로를 사용하세요.",
            fallbackEn:
              "HOLLOW · This Messenger Admin mode has no wired list writer. An empty list is not PASS. Use /admin/chats/messenger or domain messenger paths for real ops.",
          })}
        </div>
      ) : null}
      {deepLinkActive && deepLink.postId ? (
        <div className="flex flex-wrap items-center gap-2 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary">
          <span className="text-sam-muted">
            {safeT("admin_chat_filter_post_chip", {
              fallbackKo: "게시물",
              fallbackEn: "Listing",
            })}
            :
          </span>
          <Link
            href={`/admin/products/${encodeURIComponent(deepLink.postId)}`}
            className="font-mono text-signature hover:underline"
            prefetch={false}
          >
            {deepLink.postId}
          </Link>
          <Link
            href="/admin/chats/trade"
            className="sam-text-xxs text-sam-muted hover:underline"
            prefetch={false}
          >
            {safeT("admin_chat_clear_post_filter", {
              fallbackKo: "필터 해제",
              fallbackEn: "Clear filter",
            })}
          </Link>
        </div>
      ) : null}
      {deepLinkActive && focusedRoom ? (
        <div
          data-testid="admin-trade-chat-deep-link-focus"
          className="rounded-ui-rect border border-signature/30 bg-signature/5 px-3 py-2 sam-text-body-secondary text-sam-fg"
        >
          <p>
            {t("admin_trade_deep_link_chat_focus", {
              post: focusedRoom.productTitle || focusedRoom.productId || deepLink.postId || "—",
              room: focusedRoom.id,
              seller: focusedRoom.sellerNickname || focusedRoom.sellerId.slice(0, 8),
              buyer: focusedRoom.buyerNickname || focusedRoom.buyerId.slice(0, 8),
            })}
          </p>
          <Link
            href={`/admin/chats/${encodeURIComponent(focusedRoom.id)}`}
            className="mt-1 inline-block font-medium text-signature hover:underline"
          >
            {t("admin_trade_deep_link_chat_open_detail")}
          </Link>
        </div>
      ) : null}
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
          focusedRoomId={focusedRoom?.id ?? null}
          onToggleRow={handleToggleRow}
          onToggleAllVisible={handleToggleAllVisible}
        />
      )}
    </div>
  );
}
