"use client";

/**
 * 채팅방 목록 (설계 §3-4) — 전체·거래·배달 주문·일반 1:1·그룹 공용. 원천 = CM `community_messenger_rooms`.
 * 검색·필터·정렬·페이지는 전부 URL 상태. 이전 페이지는 URL `trail`(지나온 커서) — 브라우저 뒤로가기 의존 없음.
 * 행 동작 없음 — 조치는 방 상세(시트 S1~S6)에서만.
 */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { formatAdminDateTime } from "@/components/admin/i18n/admin-date-locale";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
} from "@/components/admin/ui/AdminStateViews";
import type { AdminChatRoomListRow } from "@/lib/admin-community-messenger/list-admin-rooms-paged";
import {
  ADMIN_CHAT_LIST_DEFAULT_LIMIT,
  ADMIN_CHAT_ROOM_DOMAINS,
  adminListNextPage,
  adminListPrevPage,
  buildAdminChatRoomListApiSearch,
  buildAdminChatRoomListSearch,
  currentAdminListHref,
  parseAdminChatRoomListQuery,
  readAdminListTrail,
  withAdminListTrail,
  type AdminChatRoomListQuery,
  type AdminChatRoomTypeFilter,
} from "@/lib/admin/chat-admin/admin-chat-list-url-state";
import { adminChatRoomDetailHref, adminUserDetailHref } from "@/lib/admin/chat-admin/admin-chat-links";
import { adminChatLabel } from "@/lib/admin/status-labels/chat-status-labels";
import type { MessageKey } from "@/lib/i18n/messages";

/** 화면 모드 — `all` 은 전체채팅(유형 필터), 나머지는 유형 고정 화면. */
export type AdminMessengerDomainListMode = "all" | "general" | "group" | "trade" | "store_order";

const MODE_TO_DOMAIN: Record<Exclude<AdminMessengerDomainListMode, "all">, AdminChatRoomTypeFilter> = {
  general: "general_direct",
  group: "group",
  trade: "trade",
  store_order: "store_order",
};

/** 제목 = 메뉴명 (J-AMD-4). */
const TITLE_KEY_BY_TYPE: Record<AdminChatRoomTypeFilter, MessageKey> = {
  all: "admin_menu_chat_all",
  general_direct: "admin_menu_chat_rooms_general",
  group: "admin_menu_chat_rooms_group",
  trade: "admin_menu_chat_rooms_trade",
  store_order: "admin_menu_chat_rooms_store_order",
};

export const ADMIN_TRADE_LEGACY_LIST_PATH = "/admin/chats/trade-legacy";

type Props = {
  mode: AdminMessengerDomainListMode;
};

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; code: string; httpStatus?: number }
  | { kind: "ready"; rows: AdminChatRoomListRow[]; nextCursor: string | null };

const INPUT = "rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg";
const TH = "px-3 py-2.5 text-left text-xs font-medium text-sam-muted";

export function AdminMessengerDomainRoomList({ mode }: Props) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const router = useRouter();
  const pathname = usePathname() ?? "/admin/chats";
  const searchParams = useSearchParams();
  const fixedType = mode === "all" ? undefined : MODE_TO_DOMAIN[mode];
  const spKey = searchParams?.toString() ?? "";
  const query = useMemo(
    () => parseAdminChatRoomListQuery(new URLSearchParams(spKey), fixedType),
    [spKey, fixedType]
  );
  const trail = useMemo(() => readAdminListTrail(new URLSearchParams(spKey)), [spKey]);
  const returnTo = currentAdminListHref(pathname, spKey ? `?${spKey}` : "");
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [searchDraft, setSearchDraft] = useState(query.q);
  const [reloadToken, setReloadToken] = useState(0);
  /** 설계 §3-4: 「CM 방이 없는 과거 거래 N건」 — 레거시 거래 기록 화면과 같은 서버 판정. */
  const [legacyCount, setLegacyCount] = useState<number | null>(null);

  useEffect(() => {
    setSearchDraft(query.q);
  }, [query.q]);

  const apiSearch = buildAdminChatRoomListApiSearch(query, ADMIN_CHAT_LIST_DEFAULT_LIMIT);
  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    (async () => {
      try {
        const res = await fetch(`/api/admin/community-messenger/rooms${apiSearch}`, {
          credentials: "include",
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as {
          ok?: boolean;
          rooms?: AdminChatRoomListRow[];
          nextCursor?: string | null;
          error?: string;
        } | null;
        if (cancelled) return;
        if (!res.ok || !json?.ok) {
          setState({ kind: "error", code: json?.error || "load_failed", httpStatus: res.status });
          return;
        }
        setState({
          kind: "ready",
          rows: Array.isArray(json.rooms) ? json.rooms : [],
          nextCursor: json.nextCursor ?? null,
        });
      } catch {
        if (!cancelled) setState({ kind: "error", code: "network_error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiSearch, reloadToken]);

  /** 필터 변경 = 첫 페이지 (커서·trail 초기화, replace) · 페이지 이동 = push + trail. */
  const navigate = useCallback(
    (patch: Partial<AdminChatRoomListQuery>, opts?: { trail?: string[] }) => {
      const next: AdminChatRoomListQuery = { ...query, cursor: "", ...patch };
      const search = withAdminListTrail(
        buildAdminChatRoomListSearch(next, { fixedType: Boolean(fixedType) }),
        opts?.trail ?? []
      );
      const href = `${pathname}${search}`;
      if (opts?.trail) router.push(href, { scroll: true });
      else router.replace(href, { scroll: false });
    },
    [fixedType, pathname, query, router]
  );

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    navigate({ q: searchDraft });
  };

  const deepLinked = Boolean(query.postId || query.orderId || query.buyerId || query.sellerId);
  const filtered = Boolean(
    query.q ||
      query.userId ||
      query.status ||
      query.reported ||
      query.activity ||
      query.idleDays ||
      deepLinked ||
      (mode === "all" && query.type !== "all")
  );
  const effectiveType = fixedType ?? query.type;
  useEffect(() => {
    if (effectiveType !== "trade") return;
    let cancelled = false;
    fetch("/api/admin/chats/trade-legacy", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; count?: number }) => {
        if (!cancelled) setLegacyCount(j?.ok ? Number(j.count ?? 0) : null);
      })
      .catch(() => {
        if (!cancelled) setLegacyCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveType]);
  const titleKey = TITLE_KEY_BY_TYPE[effectiveType];
  const showDomainBadge = effectiveType === "all";

  return (
    <div
      className="space-y-4 p-4 md:p-6"
      data-admin-surface="live"
      data-admin-domain="messenger"
      data-admin-chat-domain={effectiveType}
      data-testid={`admin-messenger-domain-list-${mode}`}
    >
      <AdminPageHeader titleKey={titleKey} description={t("admin_chat_rooms_desc")} />

      <form
        onSubmit={onSearch}
        className="flex flex-wrap items-center gap-2 rounded-ui-rect border border-sam-border bg-sam-surface p-3"
        data-admin-list-filters="chat-rooms"
      >
        <input
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          placeholder={t("admin_chat_rooms_search_placeholder")}
          className={`${INPUT} min-w-[240px] flex-1`}
          aria-label={t("admin_chat_list_search")}
        />
        {mode === "all" ? (
          <select
            value={query.type}
            onChange={(e) => navigate({ type: e.target.value as AdminChatRoomTypeFilter })}
            className={INPUT}
            aria-label={t("admin_chat_rooms_filter_type")}
          >
            <option value="all">{t("admin_chat_rooms_filter_type_all")}</option>
            {ADMIN_CHAT_ROOM_DOMAINS.map((d) => (
              <option key={d} value={d}>
                {adminChatLabel("chat_domain", d, ko).label}
              </option>
            ))}
          </select>
        ) : null}
        <select
          value={query.status}
          onChange={(e) => navigate({ status: e.target.value as AdminChatRoomListQuery["status"] })}
          className={INPUT}
          aria-label={t("admin_chat_rooms_filter_status")}
        >
          <option value="">{t("admin_chat_rooms_filter_status_all")}</option>
          {(["active", "blocked", "archived"] as const).map((st) => (
            <option key={st} value={st}>
              {adminChatLabel("room_status", st, ko).label}
            </option>
          ))}
        </select>
        <select
          value={query.activity ? "active_7d" : query.idleDays ? `idle_${query.idleDays}` : ""}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "active_7d") navigate({ activity: "7d", idleDays: 0 });
            else if (v.startsWith("idle_")) navigate({ activity: "", idleDays: Number(v.slice(5)) || 90 });
            else navigate({ activity: "", idleDays: 0 });
          }}
          className={INPUT}
          aria-label={t("admin_chat_rooms_filter_activity")}
        >
          <option value="">{t("admin_chat_rooms_filter_activity_all")}</option>
          <option value="active_7d">{t("admin_chat_rooms_filter_activity_7d")}</option>
          <option value={`idle_${query.idleDays || 90}`}>
            {t("admin_chat_rooms_filter_idle", { days: query.idleDays || 90 })}
          </option>
        </select>
        <select
          value={query.sort}
          onChange={(e) => navigate({ sort: e.target.value === "created" ? "created" : "" })}
          className={INPUT}
          aria-label={t("admin_chat_list_sort")}
        >
          <option value="">{t("admin_chat_rooms_sort_recent")}</option>
          <option value="created">{t("admin_chat_rooms_sort_created")}</option>
        </select>
        <label className="flex min-h-9 items-center gap-1.5 sam-text-body text-sam-fg">
          <input
            type="checkbox"
            checked={query.reported}
            onChange={(e) => navigate({ reported: e.target.checked })}
          />
          {t("admin_chat_rooms_filter_reported")}
        </label>
        <div className="ml-auto flex gap-2">
          {filtered ? (
            <AdminActionButton
              variant="ghost"
              onClick={() =>
                navigate({
                  q: "",
                  userId: "",
                  status: "",
                  reported: false,
                  activity: "",
                  idleDays: 0,
                  sort: "",
                  postId: "",
                  buyerId: "",
                  sellerId: "",
                  orderId: "",
                  type: fixedType ?? "all",
                })
              }
            >
              {t("admin_chat_list_clear_filters")}
            </AdminActionButton>
          ) : null}
          <AdminActionButton type="submit" variant="primary">
            {t("admin_chat_list_search")}
          </AdminActionButton>
        </div>
      </form>

      {query.userId || deepLinked ? (
        <div
          className="flex flex-wrap items-center gap-2 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary"
          data-admin-list-chips
        >
          {query.userId ? (
            <span className="flex items-center gap-1">
              <span className="text-sam-muted">{t("admin_chat_rooms_chip_member")}</span>
              <Link href={adminUserDetailHref(query.userId, returnTo)} className="font-mono text-signature hover:underline">
                {query.userId.slice(0, 8)}…
              </Link>
              <button type="button" className="sam-text-helper text-sam-muted underline" onClick={() => navigate({ userId: "" })}>
                {t("admin_chat_list_chip_clear")}
              </button>
            </span>
          ) : null}
          {query.postId ? (
            <span className="flex items-center gap-1">
              <span className="text-sam-muted">{t("admin_chat_rooms_chip_post")}</span>
              <span className="font-mono">{query.postId.slice(0, 8)}…</span>
              <button
                type="button"
                className="sam-text-helper text-sam-muted underline"
                onClick={() => navigate({ postId: "", buyerId: "", sellerId: "" })}
              >
                {t("admin_chat_list_chip_clear")}
              </button>
            </span>
          ) : null}
          {query.orderId ? (
            <span className="flex items-center gap-1">
              <span className="text-sam-muted">{t("admin_chat_rooms_chip_order")}</span>
              <span className="font-mono">{query.orderId.slice(0, 8)}…</span>
              <button type="button" className="sam-text-helper text-sam-muted underline" onClick={() => navigate({ orderId: "" })}>
                {t("admin_chat_list_chip_clear")}
              </button>
            </span>
          ) : null}
        </div>
      ) : null}

      {effectiveType === "trade" && legacyCount !== null && legacyCount > 0 ? (
        <p className="sam-text-helper text-sam-muted" data-admin-trade-legacy-hint={legacyCount}>
          {t("admin_chat_rooms_trade_legacy_hint", { count: legacyCount })}{" "}
          <Link href={`${ADMIN_TRADE_LEGACY_LIST_PATH}?returnTo=${encodeURIComponent(returnTo)}`} className="font-medium text-signature underline">
            {t("admin_chat_rooms_trade_legacy_link")}
          </Link>
        </p>
      ) : null}

      {state.kind === "loading" ? (
        <AdminLoadingState ko={ko} />
      ) : state.kind === "error" ? (
        <AdminErrorState
          ko={ko}
          code={state.code}
          httpStatus={state.httpStatus}
          onRetry={() => setReloadToken((n) => n + 1)}
        />
      ) : state.rows.length === 0 ? (
        <div data-testid="admin-messenger-domain-empty">
          <AdminEmptyState
            ko={ko}
            message={
              query.cursor
                ? t("admin_chat_list_empty_after_page")
                : filtered
                  ? t("admin_chat_rooms_empty_filtered")
                  : t("admin_chat_rooms_empty")
            }
          />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[880px] border-collapse sam-text-body">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app">
                <th className={TH}>{t("admin_chat_rooms_col_room")}</th>
                <th className={TH}>{t("admin_chat_rooms_col_linked")}</th>
                <th className={TH}>{t("admin_chat_rooms_col_members")}</th>
                <th className={TH}>{t("admin_chat_rooms_col_last")}</th>
                <th className={TH}>{t("admin_chat_rooms_col_status")}</th>
              </tr>
            </thead>
            <tbody>
              {state.rows.map((room) => {
                const status = adminChatLabel("room_status", room.roomStatus, ko);
                const domain = adminChatLabel("chat_domain", room.chatDomain, ko);
                const msgType = room.lastMessageType ? adminChatLabel("message_type", room.lastMessageType, ko) : null;
                return (
                  <tr key={room.id} className="border-b border-sam-border/70 last:border-0" data-admin-chat-room-row={room.id}>
                    <td className="px-3 py-2.5 align-top">
                      <Link href={adminChatRoomDetailHref(room.id, returnTo)} className="font-medium text-signature underline">
                        {room.title || t("admin_chat_rooms_untitled")}
                      </Link>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {showDomainBadge ? <AdminToneBadge tone={domain.tone}>{domain.label}</AdminToneBadge> : null}
                        {room.openReportCount > 0 ? (
                          <AdminToneBadge tone="warning">
                            {t("admin_chat_rooms_open_reports", { count: room.openReportCount })}
                          </AdminToneBadge>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      {room.linked?.kind === "trade" ? (
                        <span className="text-sam-fg">{room.linked.title || t("admin_chat_rooms_linked_post_untitled")}</span>
                      ) : room.linked?.kind === "store_order" ? (
                        <span className="text-sam-fg">
                          {room.linked.orderNo || room.linked.orderId.slice(0, 8)}
                          {room.linked.storeName ? <span className="text-sam-muted"> · {room.linked.storeName}</span> : null}
                        </span>
                      ) : (
                        <span className="text-sam-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <div className="flex flex-wrap gap-x-2 gap-y-1">
                        {room.members.length === 0 ? (
                          <span className="text-sam-muted">—</span>
                        ) : (
                          room.members.map((m) => (
                            <Link key={m.userId} href={adminUserDetailHref(m.userId, returnTo)} className="text-signature underline">
                              {m.label}
                            </Link>
                          ))
                        )}
                        {room.memberCount > room.members.length ? (
                          <span className="text-sam-muted">+{room.memberCount - room.members.length}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <div className="text-sam-muted">{msgType ? msgType.label : "—"}</div>
                      <div className="mt-0.5 sam-text-xxs text-sam-muted">
                        {room.lastMessageAt ? formatAdminDateTime(room.lastMessageAt, language) : "—"}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <AdminToneBadge tone={status.tone}>{status.label}</AdminToneBadge>
                      {room.isReadonly ? (
                        <div className="mt-1">
                          <AdminToneBadge tone="warning">{adminChatLabel("room_status", "readonly", ko).label}</AdminToneBadge>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {state.kind === "ready" && (query.cursor || state.nextCursor) ? (
        <nav className="flex flex-wrap items-center justify-end gap-2" aria-label={t("admin_chat_list_pages")} data-admin-list-pager="keyset">
          <span className="mr-auto sam-text-helper text-sam-muted">
            {t("admin_chat_list_page_size", { count: ADMIN_CHAT_LIST_DEFAULT_LIMIT })}
          </span>
          <AdminActionButton disabled={!query.cursor} onClick={() => navigate({ cursor: "" })}>
            {t("admin_chat_list_first")}
          </AdminActionButton>
          <AdminActionButton
            disabled={!query.cursor}
            onClick={() => {
              const p = adminListPrevPage(trail);
              navigate({ cursor: p.cursor }, { trail: p.trail });
            }}
          >
            {t("admin_chat_list_prev")}
          </AdminActionButton>
          <AdminActionButton
            disabled={!state.nextCursor}
            onClick={() => {
              const n = adminListNextPage(trail, query.cursor, state.nextCursor ?? "");
              navigate({ cursor: n.cursor }, { trail: n.trail });
            }}
          >
            {t("admin_chat_list_next")}
          </AdminActionButton>
        </nav>
      ) : null}
    </div>
  );
}
