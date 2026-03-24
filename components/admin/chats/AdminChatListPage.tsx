"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { isAdminUser } from "@/lib/auth/get-current-user";
import { getAdminChatRoomsFromDb } from "@/lib/admin-chats/getAdminChatRoomsFromDb";
import { fetchAdminChatRoomsApi, fetchAdminChatRoomsListApi } from "@/lib/admin-chats/fetchAdminChatRoomsApi";
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

/** 거래 채팅: 동일 글·동일 판매자·동일 구매자면 한 건으로 본다 (레거시 product_chats vs 통합 chat_rooms 이중 기록 방지) */
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
  if (r.adminChatStorage) return r.adminChatStorage;
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
  if (mode === "group") return { ...DEFAULT_FILTERS, roomType: "group" };
  return DEFAULT_FILTERS;
}

function getTitle(mode: ChatListMode): string {
  if (mode === "trade") return "거래 채팅";
  if (mode === "reported") return "신고 채팅";
  if (mode === "business") return "업체·비즈 채팅";
  if (mode === "community") return "커뮤니티 채팅";
  if (mode === "group") return "모임·게시판 채팅";
  return "전체 채팅";
}

interface AdminChatListPageProps {
  /** 전체 / 거래 / 신고 / 업체 — 메뉴별 분리 */
  mode?: ChatListMode;
}

export function AdminChatListPage({ mode = "all" }: AdminChatListPageProps) {
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

      if (mode === "business") {
        const [legacyBiz, typedBiz] = await Promise.all([
          fetchAdminChatRoomsListApi({ roomType: "general_chat", contextType: "biz_profile" }).catch(() => []),
          fetchAdminChatRoomsListApi({ roomType: "business" }).catch(() => []),
        ]);
        const seen = new Set<string>();
        fromChatRooms = [...legacyBiz, ...typedBiz].filter((r) => {
          if (seen.has(r.id)) return false;
          seen.add(r.id);
          return true;
        });
      } else if (mode === "community") {
        fromChatRooms = await fetchAdminChatRoomsListApi({ roomType: "community" }).catch(() => []);
      } else if (mode === "group") {
        fromChatRooms = await fetchAdminChatRoomsListApi({ roomType: "group" }).catch(() => []);
      } else if (mode === "trade") {
        if (isAdminUser(user)) fromProductChats = await fetchAdminChatRoomsApi().catch(() => []);
        fromChatRooms = await fetchAdminChatRoomsListApi({ roomType: "item_trade" }).catch(() => []);
      } else if (mode === "reported") {
        if (isAdminUser(user)) fromProductChats = await fetchAdminChatRoomsApi().catch(() => []);
        fromChatRooms = await fetchAdminChatRoomsListApi({ hasReport: true }).catch(() => []);
        fromProductChats = fromProductChats.filter((r) => (r.reportCount ?? 0) > 0);
      } else {
        if (isAdminUser(user)) fromProductChats = await fetchAdminChatRoomsApi().catch(() => []);
        fromChatRooms = await fetchAdminChatRoomsListApi().catch(() => []);
      }

      const merged = mergeChatRoomsForAdmin(fromProductChats, fromChatRooms)
        .filter((r) => (r.messageCount ?? 0) > 0 || (r.lastMessage ?? "").trim() !== "")
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
    setActionMessage("선택한 방을 이 화면 목록에서만 숨겼습니다. 새로고침하면 다시 보입니다.");
  }, [selectedIds]);

  const deleteSelectedFromDb = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const ids = [...selectedIds];
    const items = ids
      .map((id) => {
        const r = rooms.find((x) => x.id === id);
        if (!r) return null;
        return { id, storage: storageForBulkDelete(r) };
      })
      .filter((x): x is { id: string; storage: "chat_rooms" | "product_chats" } => x != null);

    if (
      !window.confirm(
        `선택 ${items.length}개 채팅방을 DB에서 영구 삭제합니다.\n메시지·참여자·통합 신고(chat_reports) 등 연쇄 삭제가 수행됩니다. 계속할까요?`
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
        setActionMessage(data.error ?? "삭제 요청에 실패했습니다.");
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
          `${deleted.length}건 DB 삭제 완료. 실패 ${data.errors.length}건: ${data.errors
            .map((e: { id: string; message: string }) => `${e.id.slice(0, 8)}… ${e.message}`)
            .join(" / ")}`
        );
      } else {
        setActionMessage(`${deleted.length}개 방을 DB에서 삭제했습니다.`);
      }
    } catch {
      setActionMessage("네트워크 오류로 삭제에 실패했습니다.");
    } finally {
      setActionBusy(false);
    }
  }, [selectedIds, rooms]);

  const blockSelectedTradeRooms = useCallback(async () => {
    if (selectedIds.size === 0 || mode !== "trade") return;
    if (
      !window.confirm(
        `선택한 ${selectedIds.size}개 거래 채팅방을 운영 조치로 닫습니다.\n구매자·판매자는 이후 새 메시지를 보낼 수 없습니다. 계속할까요?`
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
          body: JSON.stringify({ action: "block_room", note: "거래 채팅 목록 일괄 조치" }),
          credentials: "same-origin",
        });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (res.ok && j.ok) ok += 1;
        else errors.push(`${id.slice(0, 8)}… ${j.error ?? res.statusText}`);
      } catch {
        errors.push(`${id.slice(0, 8)}… 네트워크 오류`);
      }
    }
    setSelectedIds(new Set());
    setActionMessage(
      errors.length
        ? `${ok}건 조치 완료. 실패 ${errors.length}건: ${errors.join(" / ")}`
        : `${ok}개 채팅방을 운영 조치로 닫았습니다.`
    );
    setReloadToken((t) => t + 1);
    setActionBusy(false);
  }, [mode, selectedIds]);

  const emptyCopy =
    rooms.length === 0
      ? mode === "trade"
        ? "거래 채팅이 없습니다. 웹에서 상품 채팅하기로 대화를 시작하면 여기에 표시됩니다."
        : mode === "reported"
          ? "신고된 채팅방이 없습니다."
          : mode === "business"
            ? "업체·비즈 채팅이 없습니다."
            : mode === "community"
              ? "커뮤니티 문의 채팅이 없습니다."
              : mode === "group"
                ? "모임·게시판 문의 채팅이 없습니다."
                : "실제 채팅방이 없습니다. 웹에서 상품 채팅하기로 대화를 시작하면 여기에 표시됩니다."
      : filtered.length === 0
        ? "조건에 맞는 채팅방이 없습니다. 필터를 바꿔 보세요."
        : "표시할 채팅이 없습니다. 목록에서만 숨긴 방만 남았다면 새로고침하면 다시 보입니다.";

  return (
    <div className="space-y-4">
      <AdminPageHeader title={getTitle(mode)} />
      <AdminChatFilterBar
        filters={filters}
        searchQuery={searchQuery}
        onFiltersChange={setFilters}
        onSearchChange={setSearchQuery}
      />
      {!loading && (filtered.length > 0 || rooms.length > 0) ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-[13px]">
          <span className="text-gray-600">
            선택 <strong className="text-gray-900">{selectedIds.size}</strong>건 · 표시{" "}
            <strong className="text-gray-900">{visibleFiltered.length}</strong>건
          </span>
          <span className="hidden sm:inline text-gray-300">|</span>
          <button
            type="button"
            disabled={visibleFiltered.length === 0 || actionBusy}
            onClick={() => handleToggleAllVisible(true)}
            className="rounded border border-gray-200 bg-white px-2.5 py-1.5 font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-40"
          >
            현재 목록 전체 선택
          </button>
          <button
            type="button"
            disabled={selectedIds.size === 0 || actionBusy}
            onClick={() => setSelectedIds(new Set())}
            className="rounded border border-gray-200 bg-white px-2.5 py-1.5 font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-40"
          >
            선택 해제
          </button>
          <button
            type="button"
            disabled={selectedIds.size === 0 || actionBusy}
            onClick={hideSelectedFromListOnly}
            className="rounded border border-amber-200 bg-amber-50 px-2.5 py-1.5 font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-40"
          >
            목록에서만 제거
          </button>
          {mode === "trade" ? (
            <button
              type="button"
              disabled={selectedIds.size === 0 || actionBusy}
              onClick={() => void blockSelectedTradeRooms()}
              className="rounded border border-red-300 bg-red-100 px-2.5 py-1.5 font-medium text-red-900 hover:bg-red-200 disabled:opacity-40"
            >
              선택 방 채팅 닫기(운영)
            </button>
          ) : null}
          <button
            type="button"
            disabled={selectedIds.size === 0 || actionBusy}
            onClick={() => void deleteSelectedFromDb()}
            className="rounded border border-red-200 bg-red-50 px-2.5 py-1.5 font-medium text-red-800 hover:bg-red-100 disabled:opacity-40"
          >
            DB에서 삭제
          </button>
        </div>
      ) : null}
      {actionMessage ? (
        <p className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-[13px] text-gray-800">
          {actionMessage}
        </p>
      ) : null}
      {loading ? (
        <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
          불러오는 중...
        </div>
      ) : visibleFiltered.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
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
