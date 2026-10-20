"use client";

import { dibayAlert } from "@/components/ui/dibay-overlay";
import { useMemo, useState, useEffect, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
import {
  CHAT_ROOM_HARD_DELETE_CONFIRM_TEXT,
  CHAT_ROOM_HARD_DELETE_REASON_MIN_LENGTH,
} from "@/lib/admin/chat-admin/chat-content-access-policy";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { adminLegacyTradeChatDetailHref } from "@/lib/admin/chat-admin/admin-chat-links";
import { currentAdminListHref } from "@/lib/admin/chat-admin/admin-chat-list-url-state";
import { AdminChatFilterBar } from "./AdminChatFilterBar";
import { AdminChatTable } from "./AdminChatTable";
import { AdminChatHardDeleteSheet } from "./AdminChatSheets";
import {
  adminTradeChatDeepLinkActive,
  matchAdminChatRoomToDeepLink,
  parseAdminTradeChatDeepLink,
} from "@/lib/admin-products/admin-trade-deep-link";
import { formatAdminShortId, formatAdminShortIdEllipsis } from "@/components/admin/ui/AdminTechId";

/** C-11 — 목록 페이지 크기 (URL `page`). 서버 원장 상한 안에서 화면 페이지를 나눈다. */
const TRADE_LIST_PAGE_SIZE = 50;

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
/** `trade_legacy` = 앱 채팅방(CM)이 없는 과거 거래 채팅 — 읽기 전용 기록 (설계 §3-6). */
export type ChatListMode = "all" | "trade" | "trade_legacy" | "reported" | "business" | "community" | "group";

const DEFAULT_FILTERS: AdminChatFilters = {
  roomStatus: "",
  roomType: "",
  reportedOnly: false,
  sortKey: "lastMessage",
};

function getInitialFilters(mode: ChatListMode): AdminChatFilters {
  if (mode === "trade" || mode === "trade_legacy") return { ...DEFAULT_FILTERS, roomType: "item_trade" };
  if (mode === "reported") return { ...DEFAULT_FILTERS, reportedOnly: true };
  if (mode === "business") return DEFAULT_FILTERS;
  if (mode === "community") return { ...DEFAULT_FILTERS, roomType: "community" };
  /** 모임·게시판(chat_rooms group) + 모임 오픈채팅을 한 화면에 표시 */
  if (mode === "group") return DEFAULT_FILTERS;
  return DEFAULT_FILTERS;
}

function getTitleKey(mode: ChatListMode): MessageKey {
  if (mode === "trade") return "admin_chat_list_title_trade";
  if (mode === "trade_legacy") return "admin_chat_list_title_trade_legacy";
  if (mode === "reported") return "admin_chat_list_title_reported";
  if (mode === "business" || mode === "community" || mode === "group") return "admin_chat_removed";
  return "admin_chat_list_title_all";
}

interface AdminChatListPageProps {
  /** 전체 / 거래 / 신고 / 업체 — 메뉴별 분리 */
  mode?: ChatListMode;
}

export function AdminChatListPage({ mode = "all" }: AdminChatListPageProps) {
  const { t, safeT, language } = useI18n();
  const searchParams = useSearchParams();
  const deepLink = useMemo(() => parseAdminTradeChatDeepLink(searchParams), [searchParams]);
  const deepLinkActive = mode === "trade" && adminTradeChatDeepLinkActive(deepLink);
  const router = useRouter();
  const pathname = usePathname() ?? "/admin/chats/trade";
  const spKey = searchParams?.toString() ?? "";
  const returnTo = currentAdminListHref(pathname, spKey ? `?${spKey}` : "");
  /** C-11 — 검색·필터·페이지는 URL 이 원본 (상세 → 뒤로/returnTo 복귀 시 유지). */
  const urlStatus = (searchParams.get("status") ?? "").trim();
  const urlReported = searchParams.get("reported") === "1";
  const searchQuery = (searchParams.get("q") ?? "").trim();
  const page = Math.max(1, Math.floor(Number(searchParams.get("page")) || 1));
  const filters = useMemo<AdminChatFilters>(() => {
    const base = getInitialFilters(mode);
    const roomStatus = (["active", "blocked", "reported", "archived"] as const).find((v) => v === urlStatus) ?? "";
    return { ...base, roomStatus, reportedOnly: base.reportedOnly || urlReported };
  }, [mode, urlStatus, urlReported]);
  const updateUrl = useCallback(
    (patch: Record<string, string | null>) => {
      const sp = new URLSearchParams(spKey);
      for (const [k, v] of Object.entries(patch)) {
        if (v) sp.set(k, v);
        else sp.delete(k);
      }
      if (!("page" in patch)) sp.delete("page");
      const qs = sp.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [pathname, router, spKey]
  );
  const setFilters = useCallback(
    (f: AdminChatFilters) =>
      updateUrl({ status: f.roomStatus || null, reported: f.reportedOnly ? "1" : null }),
    [updateUrl]
  );
  const setSearchQuery = useCallback((q: string) => updateUrl({ q: q.trim() || null }), [updateUrl]);
  const [rooms, setRooms] = useState<AdminChatRoom[]>([]);
  const [loading, setLoading] = useState(true);
  /** ADMIN-07 — fetch failure must not render as “no chats”. */
  const [loadFailed, setLoadFailed] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [listHiddenIds, setListHiddenIds] = useState<Set<string>>(() => new Set());
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    setSelectedIds(new Set());
    setListHiddenIds(new Set());
  }, [mode]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadFailed(false);

    const settleRooms = async (
      p: Promise<AdminChatRoom[]>
    ): Promise<{ ok: boolean; rows: AdminChatRoom[] }> => {
      try {
        return { ok: true, rows: await p };
      } catch {
        return { ok: false, rows: [] };
      }
    };

    const load = async () => {
      let fromProductChats: AdminChatRoom[] = [];
      let fromChatRooms: AdminChatRoom[] = [];
      let anySourceOk = false;
      const hollowMode = mode === "business" || mode === "community" || mode === "group";

      if (mode === "trade_legacy") {
        // 설계 §3-6: 서버 단일 판정(`/api/admin/chats/trade-legacy`)의 방만 — 안내 줄 건수와 같은 기준.
        const [a, b, legacy] = await Promise.all([
          settleRooms(fetchAdminChatRoomsApi({ legacyOnly: true })),
          settleRooms(fetchAdminChatRoomsListApi({ roomType: "item_trade", legacyOnly: true })),
          fetch("/api/admin/chats/trade-legacy", { cache: "no-store" })
            .then((r) => r.json())
            .catch(() => null) as Promise<{ ok?: boolean; productChatIds?: string[]; chatRoomIds?: string[] } | null>,
        ]);
        const keep = new Set([...(legacy?.productChatIds ?? []), ...(legacy?.chatRoomIds ?? [])]);
        fromProductChats = a.rows.filter((r) => keep.has(r.id));
        fromChatRooms = b.rows.filter((r) => keep.has(r.id));
        anySourceOk = (a.ok || b.ok) && legacy?.ok === true;
      } else if (mode === "trade") {
        const [a, b] = await Promise.all([
          settleRooms(fetchAdminChatRoomsApi()),
          settleRooms(fetchAdminChatRoomsListApi({ roomType: "item_trade" })),
        ]);
        fromProductChats = a.rows;
        fromChatRooms = b.rows;
        anySourceOk = a.ok || b.ok;
      } else if (mode === "reported") {
        const [a, b] = await Promise.all([
          settleRooms(fetchAdminChatRoomsApi()),
          settleRooms(fetchAdminChatRoomsListApi({ hasReport: true })),
        ]);
        fromProductChats = a.rows.filter((r) => (r.reportCount ?? 0) > 0);
        fromChatRooms = b.rows;
        anySourceOk = a.ok || b.ok;
      } else if (hollowMode) {
        fromChatRooms = [];
        anySourceOk = true;
      } else {
        const [a, b] = await Promise.all([
          settleRooms(fetchAdminChatRoomsApi()),
          settleRooms(fetchAdminChatRoomsListApi()),
        ]);
        fromProductChats = a.rows;
        fromChatRooms = b.rows;
        anySourceOk = a.ok || b.ok;
      }

      const mergedAll = [...mergeChatRoomsForAdmin(fromProductChats, fromChatRooms)];
      /** Deep-link postId: keep rooms even without messages so listing→chat drill works. */
      const postFocus = mode === "trade" ? deepLink.postId : "";
      const merged = (
        // 레거시 기록은 서버 판정(메시지 있음 포함)을 그대로 — 안내 줄 건수와 행 수가 같아야 한다.
        postFocus || mode === "trade_legacy"
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
        setLoadFailed(false);
        return;
      }
      if (mode === "trade_legacy") {
        setRooms([]);
        setLoadFailed(!anySourceOk);
      } else if (mode === "all" || mode === "trade") {
        const db = await settleRooms(getAdminChatRoomsFromDb());
        if (cancelled) return;
        const list = mode === "trade" ? db.rows.filter((r) => r.roomType === "item_trade") : db.rows;
        setRooms(list.length > 0 ? list : []);
        setLoadFailed(!anySourceOk && !db.ok && list.length === 0);
      } else {
        setRooms([]);
        setLoadFailed(!anySourceOk);
      }
    };

    load().catch(() => {
      if (!cancelled) {
        setRooms([]);
        setLoadFailed(true);
      }
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

  const allVisibleFiltered = useMemo(
    () => deepLinkedFiltered.filter((r) => !listHiddenIds.has(r.id)),
    [deepLinkedFiltered, listHiddenIds]
  );
  const pageCount = Math.max(1, Math.ceil(allVisibleFiltered.length / TRADE_LIST_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleFiltered = useMemo(
    () =>
      allVisibleFiltered.slice(
        (currentPage - 1) * TRADE_LIST_PAGE_SIZE,
        currentPage * TRADE_LIST_PAGE_SIZE
      ),
    [allVisibleFiltered, currentPage]
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

  /** 레거시 기록 — 영구 삭제는 시트 S6 (super_admin · 사유 10자 · DELETE 재입력, 서버가 증거 연결 방 제외). */
  const [hardDeleteItems, setHardDeleteItems] = useState<
    Array<{ id: string; storage: "chat_rooms" | "product_chats"; label: string }> | null
  >(null);
  const openHardDeleteSheet = useCallback(() => {
    const byId = new Map(rooms.map((r) => [r.id, r]));
    const items = [...selectedIds]
      .map((id) => byId.get(id))
      .filter((r): r is AdminChatRoom => Boolean(r))
      .map((r) => ({ id: r.id, storage: storageForBulkDelete(r), label: r.productTitle || formatAdminShortId(r.id) }));
    if (items.length) setHardDeleteItems(items);
  }, [rooms, selectedIds]);

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

    // 선택 방 DB 영구 삭제 = purge (L3: 사유 + 확인 문구 재입력). R1-A C-3: 사유 10자 이상 — super_admin 전용,
    // 신고 연결 방은 서버가 증거 보존으로 제외.
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("purge"),
      ko: language !== "en",
      title: t("admin_chat_delete_from_db"),
      description: `${t("admin_chat_delete_confirm", { count: items.length })}\n${t("admin_chat_r1_hard_delete_reason_desc")}`,
      confirmLabel: t("admin_chat_delete_from_db"),
      destructive: true,
      retypeValue: CHAT_ROOM_HARD_DELETE_CONFIRM_TEXT,
      reasonPlaceholder: t("admin_chat_r1_hard_delete_reason_title"),
    });
    if (!confirmed.ok) return;
    const reason = (confirmed.reason ?? "").trim();
    if (reason.length < CHAT_ROOM_HARD_DELETE_REASON_MIN_LENGTH) {
      await dibayAlert({ title: t("admin_chat_r1_content_reason_too_short") });
      return;
    }

    setActionBusy(true);
    setActionMessage(null);
    try {
      const res = await fetch("/api/admin/chat/rooms/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, reason, confirmText: CHAT_ROOM_HARD_DELETE_CONFIRM_TEXT }),
      });
      const data = await res.json().catch(() => ({}));
      const deleted: string[] = Array.isArray(data.deleted) ? data.deleted : [];
      if (!res.ok && !deleted.length) {
        setActionMessage(
          res.status === 403
            ? t("admin_chat_r1_hard_delete_super_admin_only")
            : (data.error ?? t("admin_chat_delete_failed"))
        );
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
              .map(
                (e: { id: string; message: string }) =>
                  `${formatAdminShortIdEllipsis(e.id)} ${
                    e.message === "evidence_preserved" ? t("admin_chat_r1_hard_delete_evidence_skipped") : e.message
                  }`
              )
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
  }, [language, selectedIds, rooms, t]);

  const blockSelectedTradeRooms = useCallback(async () => {
    if (selectedIds.size === 0 || mode !== "trade") return;
    // 선택 방 일괄 운영 종료 = bulk (L3: 사유 + 대상 건수 재입력) — 서버도 같은 사유 규칙을 검증·감사한다.
    const ko = language !== "en";
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("bulk"),
      ko,
      title: t("admin_chat_block_confirm", { count: selectedIds.size }),
      confirmLabel: t("admin_chat_close_selected_ops"),
      destructive: true,
      retypeValue: ko ? `${selectedIds.size}건` : `${selectedIds.size} rooms`,
    });
    if (!confirmed.ok) return;
    const bulkReason = confirmed.reason ?? t("admin_chat_bulk_list_note");
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
          body: JSON.stringify({ action: "block_room", note: bulkReason, reason: bulkReason }),
          credentials: "same-origin",
        });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (res.ok && j.ok) ok += 1;
        else errors.push(`${formatAdminShortIdEllipsis(id)} ${j.error ?? res.statusText}`);
      } catch {
        errors.push(`${formatAdminShortIdEllipsis(id)} ${t("common_network_error")}`);
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
  }, [language, mode, selectedIds, t]);

  const focusedRoom = deepLinkActive ? visibleFiltered[0] ?? null : null;

  const emptyCopy =
    loadFailed && rooms.length === 0
      ? safeT("admin_chat_domain_list_error", {
          fallbackKo: "목록을 불러오지 못했습니다. 새로고침해 주세요.",
          fallbackEn: "Could not load the list. Please try again.",
        })
      : rooms.length === 0
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

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey={getTitleKey(mode)} />
      {mode === "trade_legacy" && !loading && !loadFailed ? (
        <p className="sam-text-body-secondary text-sam-muted" data-admin-trade-legacy-count={rooms.length}>
          {t("admin_chat_trade_legacy_count", { count: rooms.length })}
        </p>
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
              seller: focusedRoom.sellerNickname || formatAdminShortId(focusedRoom.sellerId),
              buyer: focusedRoom.buyerNickname || formatAdminShortId(focusedRoom.buyerId),
            })}
          </p>
          <Link
            href={adminLegacyTradeChatDetailHref(focusedRoom.id, returnTo)}
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
      {!loading ? (
        <div className="flex flex-wrap items-center gap-2 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary">
          <span className="text-sam-muted">
            {t("admin_chat_selected_summary", {
              selected: selectedIds.size,
              visible: allVisibleFiltered.length,
            })}
          </span>
          <span className="hidden sm:inline text-sam-meta">|</span>
          <AdminActionButton
            disabled={visibleFiltered.length === 0 || actionBusy}
            onClick={() => handleToggleAllVisible(true)}
          >
            {t("admin_chat_select_all_visible")}
          </AdminActionButton>
          <AdminActionButton disabled={selectedIds.size === 0 || actionBusy} onClick={() => setSelectedIds(new Set())}>
            {t("admin_chat_clear_selection")}
          </AdminActionButton>
          <AdminActionButton
            variant="secondary"
            disabled={selectedIds.size === 0 || actionBusy}
            onClick={hideSelectedFromListOnly}
            data-admin-mgmt-bulk-action="hide_list"
          >
            {t("admin_chat_remove_list_only")}
          </AdminActionButton>
          {mode === "trade" ? (
            <AdminActionButton
              variant="secondary"
              disabled={selectedIds.size === 0 || actionBusy}
              onClick={() => void blockSelectedTradeRooms()}
            >
              {t("admin_chat_close_selected_ops")}
            </AdminActionButton>
          ) : null}
          <span className="mx-0.5 hidden h-6 w-px bg-sam-border sm:inline" aria-hidden />
          <AdminActionButton
            variant="danger"
            disabled={selectedIds.size === 0 || actionBusy}
            onClick={() => (mode === "trade_legacy" ? openHardDeleteSheet() : void deleteSelectedFromDb())}
            data-admin-mgmt-hard-delete="1"
          >
            {t("admin_chat_delete_from_db")}
          </AdminActionButton>
        </div>
      ) : null}
      {actionMessage ? (
        <p className="rounded border border-sam-border bg-sam-app px-3 py-2 sam-text-body-secondary text-sam-fg">
          {actionMessage}
        </p>
      ) : null}
      {loading ? (
        <AdminLoadingState ko={language !== "en"} label={t("admin_chat_loading_room")} />
      ) : loadFailed && rooms.length === 0 ? (
        <AdminErrorState ko={language !== "en"} code="load_failed" onRetry={() => setReloadToken((n) => n + 1)} />
      ) : visibleFiltered.length === 0 ? (
        <AdminEmptyState ko={language !== "en"} message={emptyCopy} />
      ) : (
        <AdminChatTable
          rooms={visibleFiltered}
          selectedIds={selectedIds}
          focusedRoomId={focusedRoom?.id ?? null}
          onToggleRow={handleToggleRow}
          onToggleAllVisible={handleToggleAllVisible}
          returnTo={returnTo}
        />
      )}
      {hardDeleteItems ? (
        <AdminChatHardDeleteSheet
          items={hardDeleteItems}
          onClose={() => setHardDeleteItems(null)}
          onSettled={() => {
            setHardDeleteItems(null);
            setSelectedIds(new Set());
            setActionMessage(t("admin_chat_s6_done"));
            setReloadToken((n) => n + 1);
          }}
        />
      ) : null}
      {!loading && pageCount > 1 ? (
        <nav className="flex flex-wrap items-center gap-2 sam-text-body-secondary" data-admin-list-pager="page">
          <AdminActionButton
            disabled={currentPage <= 1}
            onClick={() => updateUrl({ page: currentPage - 1 > 1 ? String(currentPage - 1) : null })}
          >
            {t("admin_chat_list_prev")}
          </AdminActionButton>
          <span className="text-sam-muted">
            {currentPage} / {pageCount}
          </span>
          <AdminActionButton disabled={currentPage >= pageCount} onClick={() => updateUrl({ page: String(currentPage + 1) })}>
            {t("admin_chat_list_next")}
          </AdminActionButton>
        </nav>
      ) : null}
    </div>
  );
}
