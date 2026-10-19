"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { formatAdminDateTime } from "@/components/admin/i18n/admin-date-locale";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
} from "@/components/admin/ui/AdminStateViews";
import type { AdminChatRoomListRow } from "@/lib/admin-community-messenger/list-admin-rooms-paged";
import {
  ADMIN_CHAT_LIST_DEFAULT_LIMIT,
  ADMIN_CHAT_ROOM_DOMAINS,
  buildAdminChatRoomListApiSearch,
  buildAdminChatRoomListSearch,
  currentAdminListHref,
  parseAdminChatRoomListQuery,
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

type Props = {
  mode: AdminMessengerDomainListMode;
};

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; code: string; httpStatus?: number }
  | { kind: "ready"; rows: AdminChatRoomListRow[]; nextCursor: string | null };

const INPUT = "rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg";
const BTN = "rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body font-medium text-sam-fg hover:bg-sam-app disabled:opacity-40";

export function AdminMessengerDomainRoomList({ mode }: Props) {
  const { language } = useI18n();
  const ko = language !== "en";
  const L = (k: string, e: string) => (ko ? k : e);
  const router = useRouter();
  const pathname = usePathname() ?? "/admin/chats";
  const searchParams = useSearchParams();
  const fixedType = mode === "all" ? undefined : MODE_TO_DOMAIN[mode];
  const spKey = searchParams?.toString() ?? "";
  const query = useMemo(
    () => parseAdminChatRoomListQuery(new URLSearchParams(spKey), fixedType),
    [spKey, fixedType]
  );
  const returnTo = currentAdminListHref(pathname, spKey ? `?${spKey}` : "");
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [searchDraft, setSearchDraft] = useState(query.q);
  const [reloadToken, setReloadToken] = useState(0);

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

  /** 필터 변경 = 첫 페이지 (커서 초기화) · 페이지 이동은 push 로 뒤로가기 지원. */
  const navigate = useCallback(
    (patch: Partial<AdminChatRoomListQuery>, opts?: { push?: boolean }) => {
      const next: AdminChatRoomListQuery = { ...query, cursor: "", ...patch };
      const href = `${pathname}${buildAdminChatRoomListSearch(next, { fixedType: Boolean(fixedType) })}`;
      if (opts?.push) router.push(href, { scroll: true });
      else router.replace(href, { scroll: false });
    },
    [fixedType, pathname, query, router]
  );

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    navigate({ q: searchDraft });
  };

  const filtered = Boolean(
    query.q ||
      query.userId ||
      query.status ||
      query.reported ||
      query.activity ||
      query.idleDays ||
      (mode === "all" && query.type !== "all")
  );
  const titleKey = TITLE_KEY_BY_TYPE[fixedType ?? query.type];

  return (
    <div
      className="space-y-4 p-4 md:p-6"
      data-admin-surface="live"
      data-admin-domain="messenger"
      data-admin-chat-domain={fixedType ?? query.type}
      data-testid={`admin-messenger-domain-list-${mode}`}
    >
      <AdminPageHeader
        titleKey={titleKey}
        description={L(
          "채팅방을 최근 대화 순으로 봅니다. 방 이름을 누르면 상세(참여자·메시지·조치)로 이동하고, 돌아오면 같은 검색·필터·페이지가 유지됩니다.",
          "Rooms by latest activity. Open a room for participants, messages and actions; coming back keeps the same search, filters and page."
        )}
      />

      <form
        onSubmit={onSearch}
        className="flex flex-wrap items-center gap-2 rounded-ui-rect border border-sam-border bg-sam-surface p-3"
        data-admin-list-filters="chat-rooms"
      >
        <input
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          placeholder={L("방 이름 · 참여자 닉네임 · 방 ID · 회원 ID", "Room name · member nickname · room ID · member ID")}
          className={`${INPUT} min-w-[240px] flex-1`}
          aria-label={L("검색", "Search")}
        />
        {mode === "all" ? (
          <select
            value={query.type}
            onChange={(e) => navigate({ type: e.target.value as AdminChatRoomTypeFilter })}
            className={INPUT}
            aria-label={L("채팅 유형", "Chat type")}
          >
            <option value="all">{L("전체 유형", "All types")}</option>
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
          aria-label={L("방 상태", "Room status")}
        >
          <option value="">{L("전체 상태", "All statuses")}</option>
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
          aria-label={L("활동 기간", "Activity")}
        >
          <option value="">{L("전체 기간", "Any activity")}</option>
          <option value="active_7d">{L("최근 7일 활동", "Active in last 7 days")}</option>
          <option value={`idle_${query.idleDays || 90}`}>
            {L(`${query.idleDays || 90}일 이상 미사용`, `Idle ${query.idleDays || 90}+ days`)}
          </option>
        </select>
        <label className="flex items-center gap-1.5 sam-text-body text-sam-fg">
          <input
            type="checkbox"
            checked={query.reported}
            onChange={(e) => navigate({ reported: e.target.checked })}
          />
          {L("미처리 신고 있는 방", "Rooms with open reports")}
        </label>
        <button type="submit" className={BTN}>
          {L("검색", "Search")}
        </button>
        {filtered ? (
          <button
            type="button"
            className={BTN}
            onClick={() =>
              navigate({
                q: "",
                userId: "",
                status: "",
                reported: false,
                activity: "",
                idleDays: 0,
                type: fixedType ?? "all",
              })
            }
          >
            {L("필터 초기화", "Clear filters")}
          </button>
        ) : null}
      </form>

      {query.userId ? (
        <div className="flex flex-wrap items-center gap-2 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary">
          <span className="text-sam-muted">{L("참여 회원", "Member")}:</span>
          <Link href={adminUserDetailHref(query.userId, returnTo)} className="font-mono text-signature hover:underline">
            {query.userId.slice(0, 8)}…
          </Link>
          <button type="button" className="sam-text-helper text-sam-muted underline" onClick={() => navigate({ userId: "" })}>
            {L("해제", "Clear")}
          </button>
        </div>
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
                ? L("이 페이지 이후로 더 표시할 채팅방이 없습니다.", "No more rooms after this page.")
                : filtered
                  ? L("조건에 맞는 채팅방이 없습니다.", "No rooms match these filters.")
                  : L("아직 채팅방이 없습니다.", "No chat rooms yet.")
            }
          />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[760px] border-collapse sam-text-body">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app text-left text-sam-fg">
                <th className="px-3 py-2.5 font-medium">{L("채팅방", "Room")}</th>
                <th className="px-3 py-2.5 font-medium">{L("참여자", "Members")}</th>
                <th className="px-3 py-2.5 font-medium">{L("최근 메시지", "Last message")}</th>
                <th className="px-3 py-2.5 font-medium">{L("상태", "Status")}</th>
              </tr>
            </thead>
            <tbody>
              {state.rows.map((room) => {
                const status = adminChatLabel("room_status", room.roomStatus, ko);
                const domain = adminChatLabel("chat_domain", room.chatDomain, ko);
                const msgType = room.lastMessageType && room.lastMessageType !== "text"
                  ? adminChatLabel("message_type", room.lastMessageType, ko)
                  : null;
                return (
                  <tr key={room.id} className="border-b border-sam-border/70 last:border-0" data-admin-chat-room-row={room.id}>
                    <td className="px-3 py-2.5 align-top">
                      <Link
                        href={adminChatRoomDetailHref(room.id, returnTo)}
                        className="font-medium text-signature underline"
                      >
                        {room.title || L("이름 없는 채팅방", "Untitled room")}
                      </Link>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {mode === "all" ? <AdminToneBadge tone={domain.tone}>{domain.label}</AdminToneBadge> : null}
                        {room.openReportCount > 0 ? (
                          <AdminToneBadge tone="warning">
                            {L(`미처리 신고 ${room.openReportCount}`, `Open reports ${room.openReportCount}`)}
                          </AdminToneBadge>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <div className="flex flex-wrap gap-x-2 gap-y-1">
                        {room.members.length === 0 ? (
                          <span className="text-sam-muted">—</span>
                        ) : (
                          room.members.map((m) => (
                            <Link
                              key={m.userId}
                              href={adminUserDetailHref(m.userId, returnTo)}
                              className="text-signature underline"
                            >
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
                      <div className="line-clamp-2 text-sam-fg">
                        {msgType ? <span className="mr-1 text-sam-muted">[{msgType.label}]</span> : null}
                        {room.lastMessage || (msgType ? "" : "—")}
                      </div>
                      <div className="mt-0.5 sam-text-xxs text-sam-muted">
                        {room.lastMessageAt ? formatAdminDateTime(room.lastMessageAt, language) : "—"}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <AdminToneBadge tone={status.tone}>{status.label}</AdminToneBadge>
                      {room.isReadonly ? (
                        <div className="mt-1">
                          <AdminToneBadge tone="warning">{L("읽기 전용", "Read-only")}</AdminToneBadge>
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
        <nav className="flex flex-wrap items-center gap-2" aria-label={L("페이지", "Pages")} data-admin-list-pager="keyset">
          {query.cursor ? (
            <button type="button" className={BTN} onClick={() => navigate({ cursor: "" }, { push: true })}>
              {L("처음으로", "First page")}
            </button>
          ) : null}
          {query.cursor ? (
            <button type="button" className={BTN} onClick={() => router.back()}>
              {L("이전", "Previous")}
            </button>
          ) : null}
          {state.nextCursor ? (
            <button
              type="button"
              className={BTN}
              onClick={() => navigate({ cursor: state.nextCursor ?? "" }, { push: true })}
            >
              {L("다음", "Next")}
            </button>
          ) : null}
          <span className="sam-text-helper text-sam-muted">
            {L(`한 페이지 ${ADMIN_CHAT_LIST_DEFAULT_LIMIT}개`, `${ADMIN_CHAT_LIST_DEFAULT_LIMIT} per page`)}
          </span>
        </nav>
      ) : null}
    </div>
  );
}
