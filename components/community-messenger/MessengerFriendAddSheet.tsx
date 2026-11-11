"use client";

import { useCallback, useRef, useState, type RefObject } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MessengerHomeBottomSheetShell } from "@/components/community-messenger/MessengerSheetUi";
import Link from "next/link";
import { MESSENGER_CONTACTS_SCREEN_HREF } from "@/lib/community-messenger/contacts/contacts-contract";
import { Sam } from "@/lib/ui/sam-component-classes";
import { MessengerSearchHighlightText } from "@/components/community-messenger/MessengerSearchHighlightText";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import type { CommunityMessengerLocalSettings } from "@/lib/community-messenger/preferences";
import { COMMUNITY_MESSENGER_USER_SEARCH_MIN_LENGTH } from "@/lib/community-messenger/user-public-id-search";
import type { CommunityMessengerUserSearchResult } from "@/lib/community-messenger/user-public-id-search";
import { resolveMessengerPeerSocialCta } from "@/lib/community-messenger/messenger-friend-add-cta";
import {
  MessengerFriendRelationCta,
  type MessengerFriendCtaBusy,
} from "@/components/community-messenger/friend-cta/MessengerFriendRelationCta";

/** 검색 결과 행 친구 CTA — 홈의 친구 요청 목록에서 계산한 상태 + 행동 */
export type MessengerFriendAddSheetFriendActions = {
  pendingSets: {
    outgoingPendingPeerIds: ReadonlySet<string>;
    incomingPendingByPeerId: ReadonlyMap<string, string>;
  };
  /** 처리 결과(성공 true)를 돌려주면 호출부가 성공 뒤 화면 정리(검색 카드 접기 등)를 할 수 있다 */
  onSend: (userId: string) => void | Promise<boolean>;
  onCancel: (userId: string) => void | Promise<boolean>;
  onRespond: (requestId: string, action: "accept" | "reject", peerLabel: string) => void | Promise<boolean>;
  /**
   * 현재 친구 id (홈 친구 목록 기준). 있으면 검색 응답의 isFriend 대신 이 값을 쓴다 — 검색 뒤 삭제·수락이
   * 일어나도 같은 결과 행이 바로 맞는 버튼을 보이게(D-7, 2026-10-25 실기기).
   */
  friendIds?: ReadonlySet<string>;
  /** 행 본문 탭 → 프로필 시트 */
  onOpenProfile: (user: CommunityMessengerUserSearchResult) => void;
};

export type MessengerFriendAddTab = "id" | "contacts" | "invite";

type Props = {
  onClose: () => void;
  friendAddTab: MessengerFriendAddTab;
  onFriendAddTabChange: (tab: MessengerFriendAddTab) => void;
  localSettings: CommunityMessengerLocalSettings;
  updateLocalSetting: (key: keyof CommunityMessengerLocalSettings, value: boolean) => void;
  searchKeyword: string;
  onSearchKeywordChange: (value: string) => void;
  friendSearchRef: RefObject<HTMLInputElement | null>;
  onSearchUsers: () => void | Promise<void>;
  searchBusy?: boolean;
  friendUserSearchAttempted: boolean;
  searchResults: CommunityMessengerUserSearchResult[];
  viewerUserId: string | null;
  busyId: string | null;
  onPrefetchDirectRoom: (userId: string) => void;
  onStartDirectChat: (userId: string) => void;
  /** 초대 링크·QR 탭에 표시할 공개 URL */
  inviteUrl: string;
  /** 없으면 예전처럼 행 탭 = 1:1 채팅 */
  friendActions?: MessengerFriendAddSheetFriendActions;
};

const TAB_ORDER: MessengerFriendAddTab[] = ["id", "contacts", "invite"];

function tabLabel(t: MessengerFriendAddTab): "cm_ui_at_id" | "cm_ui_contacts" | "cm_ui_qr_invite" {
  switch (t) {
    case "id":
      return "cm_ui_at_id";
    case "contacts":
      return "cm_ui_contacts";
    case "invite":
      return "cm_ui_qr_invite";
    default:
      return "cm_ui_at_id";
  }
}

export function MessengerFriendAddSheet({
  onClose,
  friendAddTab,
  onFriendAddTabChange,
  searchKeyword,
  onSearchKeywordChange,
  friendSearchRef,
  onSearchUsers,
  searchBusy = false,
  friendUserSearchAttempted,
  searchResults,
  viewerUserId,
  busyId,
  onPrefetchDirectRoom,
  onStartDirectChat,
  inviteUrl,
  friendActions,
}: Props) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const copyInvite = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied((prev) => (prev ? prev : true));
      window.setTimeout(() => setCopied((prev) => (prev ? false : prev)), 2000);
    } catch {
      /* ignore */
    }
  }, [inviteUrl]);

  return (
    <MessengerHomeBottomSheetShell
      onClose={onClose}
      closeAriaLabel={t("nav_close")}
      dialogAriaLabel={t("cm_ui_new_conversation")}
      anchor="center"
      panelClassName="rounded-[length:var(--overlay-radius-lg)]"
    >
        <div className="flex shrink-0 items-center justify-between border-b border-[color:var(--overlay-border)] px-3 py-2.5">
          <p
            className="text-[length:var(--overlay-title-2-size)] font-semibold leading-[1.4]"
            style={{ color: "var(--overlay-text-primary)" }}
          >
            {t("cm_ui_new_conversation")}
          </p>
          <button
            type="button"
            className="dibay-overlay-icon-btn shrink-0"
            aria-label={t("nav_close")}
            onClick={onClose}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex shrink-0 border-b border-[color:var(--overlay-border)] bg-[color:var(--overlay-secondary)]">
          {TAB_ORDER.map((tab) => {
            const disabled = false;
            const active = friendAddTab === tab;
            return (
              <button
                key={tab}
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (disabled) return;
                  onFriendAddTabChange(tab);
                  if (tab === "id") {
                    requestAnimationFrame(() => friendSearchRef.current?.focus());
                  }
                }}
                className={`relative min-w-0 flex-1 px-1 py-2.5 text-[length:var(--overlay-body-2-size)] font-medium leading-[1.4] ${
                  disabled ? "cursor-not-allowed bg-[color:var(--sm-color-primary-disabled)]" : ""
                } ${active ? "font-semibold" : ""}`}
                style={{ color: active ? "var(--overlay-text-primary)" : "var(--overlay-text-secondary)" }}
              >
                <span className="line-clamp-2">{t(tabLabel(tab))}</span>
                {active ? (
                  <span
                    className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full"
                    style={{ backgroundColor: "var(--overlay-primary)" }}
                  />
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[color:var(--overlay-surface)] px-3 pb-4 pt-3">
          {friendAddTab === "contacts" ? (
            <div className="space-y-3 py-2 text-center" data-cm-friend-add-contacts="">
              {/* 연락처 동기화 (SSOT v5 §13) — 예전 무동작 스위치 2개 대신 연락처 화면으로 (동의 전이면 그 화면에서 동의) */}
              <p className="text-[length:var(--overlay-body-1-size)] font-semibold leading-[1.4]" style={{ color: "var(--overlay-text-primary)" }}>
                {t("cm_contacts_start_title")}
              </p>
              <p className="text-[length:var(--overlay-body-2-size)] leading-[1.4]" style={{ color: "var(--overlay-text-secondary)" }}>
                {t("cm_contacts_start_desc")}
              </p>
              <Link href={MESSENGER_CONTACTS_SCREEN_HREF} onClick={onClose} className={`${Sam.btn.primaryCombo} w-full`}>
                {t("cm_contacts_section_title")}
              </Link>
            </div>
          ) : null}

          {friendAddTab === "id" ? (
            <div className="space-y-3">
              <div>
                <div
                  className="flex justify-end text-[length:var(--overlay-caption-size)] tabular-nums"
                  style={{ color: "var(--overlay-text-secondary)" }}
                >
                  {searchKeyword.length}/20
                </div>
                <input
                  ref={friendSearchRef}
                  value={searchKeyword}
                  onChange={(e) => onSearchKeywordChange(e.target.value.slice(0, 20))}
                  maxLength={20}
                  placeholder={t("cm_ui_at_id_example")}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="dibay-overlay-input !mt-0 placeholder:text-[length:var(--overlay-body-2-size)] placeholder:text-[color:var(--overlay-text-secondary)]"
                />
                {searchKeyword.trim().length > 0 &&
                searchKeyword.trim().length < COMMUNITY_MESSENGER_USER_SEARCH_MIN_LENGTH ? (
                  <p className="mt-2 text-[length:var(--overlay-caption-size)]" style={{ color: "var(--overlay-text-secondary)" }}>
                    {t("cm_ui_enter_keyword_then_search")}
                  </p>
                ) : (
                  /** 친구 찾기 규칙 안내 — DB cm_search_members 와 같은 규칙 (설계안 v3 §3.3) */
                  <p
                    className="mt-2 text-[length:var(--overlay-caption-size)]"
                    style={{ color: "var(--overlay-text-secondary)" }}
                    data-testid="friend-add-id-rule-hint"
                  >
                    {t("cm_friend_find_by_id_rule_hint")}
                  </p>
                )}
              </div>
              <div className="divide-y divide-[color:var(--overlay-border)] overflow-hidden rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-surface)]">
                {searchBusy ? (
                  <p
                    className="px-3 py-4 text-center text-[length:var(--overlay-body-2-size)]"
                    style={{ color: "var(--overlay-text-secondary)" }}
                  >
                    {t("common_loading")}
                  </p>
                ) : searchResults.length === 0 ? (
                  <p
                    className="px-3 py-4 text-center text-[length:var(--overlay-body-2-size)]"
                    style={{ color: "var(--overlay-text-secondary)" }}
                  >
                    {!friendUserSearchAttempted || searchKeyword.trim().length < COMMUNITY_MESSENGER_USER_SEARCH_MIN_LENGTH
                      ? t("cm_ui_enter_keyword_then_search")
                      : t("cm_social_no_matching_users")}
                  </p>
                ) : (
                  searchResults.map((user) => (
                    <MessengerFriendSearchResultRow
                      key={user.id}
                      user={user}
                      busyId={busyId}
                      onPrefetchDirectRoom={onPrefetchDirectRoom}
                      onStartDirectChat={onStartDirectChat}
                      viewerUserId={viewerUserId}
                      friendActions={friendActions}
                      surface="overlay"
                    />
                  ))
                )}
              </div>
            </div>
          ) : null}

          {friendAddTab === "invite" ? (
            <div className="space-y-3">
              <p className="text-[length:var(--overlay-body-2-size)] leading-[1.6]" style={{ color: "var(--overlay-text-secondary)" }}>
                {t("cm_ui_invite_link_share_hint")}
              </p>
              <div className="rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] bg-[color:var(--sm-color-primary-soft)] px-3 py-2.5">
                <p
                  className="text-[length:var(--overlay-caption-size)] font-medium uppercase tracking-wide"
                  style={{ color: "var(--overlay-text-secondary)" }}
                >
                  {t("cm_ui_invite_url_label")}
                </p>
                <p
                  className="mt-1 break-all text-[length:var(--overlay-body-2-size)] leading-snug"
                  style={{ color: "var(--overlay-text-primary)" }}
                >
                  {inviteUrl}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void copyInvite()}
                className="dibay-overlay-btn dibay-overlay-btn--primary !flex-none"
              >
                {copied ? t("cm_ui_copied") : t("cm_ui_copy_link")}
              </button>
            </div>
          ) : null}
        </div>

        </div>
    </MessengerHomeBottomSheetShell>
  );
}

/** 검색 결과 행 모양 — page 값은 예전 그대로 (친구 탭 인라인 검색) */
const SEARCH_ROW_PAGE_UI = {
  rowButton:
    "-my-1 -ml-1 flex min-w-0 flex-1 items-center gap-2.5 rounded-ui-rect py-1 pl-1 text-left transition-colors active:bg-[color:var(--messenger-primary-soft)] disabled:opacity-40",
  avatar: "bg-[color:var(--messenger-surface-muted)] ring-1 ring-[color:var(--messenger-primary-soft-2)]",
  initial: "sam-text-body-secondary font-semibold",
  name: "flex min-w-0 items-center gap-1.5 sam-text-body font-semibold",
  chip: "shrink-0 rounded-full px-1.5 py-px text-[11px] font-semibold leading-4",
  chipBrand: "bg-[color:var(--messenger-primary-soft)] text-[color:var(--messenger-primary)]",
  chipNeutral: "bg-[color:var(--messenger-surface-muted)] text-[color:var(--messenger-text-secondary)]",
  sub: "truncate sam-text-xxs",
  note: "max-w-[6.5rem] shrink-0 text-right sam-text-xxs leading-tight",
  ellipsis: "shrink-0 sam-text-xxs",
  primaryColor: "var(--messenger-text)",
  secondaryColor: "var(--messenger-text-secondary)",
} as const;

/** 시트 안 (팝업 SSOT T3) — 글자 16/14/12 · overlay 색 · 비활성 회색 · 행 눌림 배경만 */
const SEARCH_ROW_OVERLAY_UI = {
  rowButton:
    "-my-1 -ml-1 flex min-w-0 flex-1 items-center gap-2.5 rounded-[length:var(--overlay-radius-sm)] py-1 pl-1 text-left transition-colors enabled:active:bg-[color:var(--overlay-secondary)] disabled:cursor-not-allowed disabled:bg-[color:var(--sm-color-primary-disabled)]",
  avatar: "bg-[color:var(--overlay-secondary)] ring-1 ring-[color:var(--overlay-border)]",
  initial: "text-[length:var(--overlay-body-2-size)] font-semibold",
  name: "flex min-w-0 items-center gap-1.5 text-[length:var(--overlay-body-1-size)] font-semibold leading-[1.4]",
  chip: "shrink-0 rounded-full px-1.5 py-px text-[length:var(--overlay-caption-size)] font-semibold leading-4",
  chipBrand: "bg-[color:var(--sm-color-primary-soft)] text-[color:var(--overlay-primary)]",
  chipNeutral: "bg-[color:var(--overlay-secondary)] text-[color:var(--overlay-text-secondary)]",
  sub: "truncate text-[length:var(--overlay-caption-size)]",
  note: "max-w-[6.5rem] shrink-0 text-right text-[length:var(--overlay-caption-size)] leading-tight",
  ellipsis: "shrink-0 text-[length:var(--overlay-caption-size)]",
  primaryColor: "var(--overlay-text-primary)",
  secondaryColor: "var(--overlay-text-secondary)",
} as const;

/** 사용자 검색 결과 행 — 친구 추가 시트·친구 탭 인라인 검색 공용 */
export function MessengerFriendSearchResultRow({
  user,
  busyId,
  onPrefetchDirectRoom,
  onStartDirectChat,
  viewerUserId,
  friendActions,
  surface = "page",
}: {
  user: CommunityMessengerUserSearchResult;
  busyId: string | null;
  onPrefetchDirectRoom: (userId: string) => void;
  onStartDirectChat: (userId: string) => void;
  viewerUserId: string | null;
  friendActions?: MessengerFriendAddSheetFriendActions;
  /** page = 친구 탭 인라인 검색(기존 모양) · overlay = 친구 추가 시트 안 (팝업 SSOT T3) */
  surface?: "page" | "overlay";
}) {
  const { t } = useI18n();
  const ui = surface === "overlay" ? SEARCH_ROW_OVERLAY_UI : SEARCH_ROW_PAGE_UI;
  const prefetchOnceRef = useRef(false);
  const avatarSrc = user.avatarUrl?.trim() ? user.avatarUrl.trim() : null;
  const initial = user.displayName.trim().slice(0, 1) || "?";
  const publicIdLabel = user.publicId ? `@${user.publicId}` : "";
  const bChat = busyId === `room:${user.id}`;
  const cannotMessage = !user.canMessage;
  const isSelf = Boolean(viewerUserId && viewerUserId === user.id);
  const blocked = user.isBlockedByMe || user.isBlockedByPeer;
  const cta = friendActions
    ? resolveMessengerPeerSocialCta(
        { id: user.id, isFriend: friendActions.friendIds ? friendActions.friendIds.has(user.id) : user.isFriend, blocked },
        friendActions.pendingSets
      )
    : null;
  const incomingRequestId = cta?.kind === "pending_incoming" ? cta.requestId : "";
  const ctaBusy: MessengerFriendCtaBusy =
    busyId === `friend-add:${user.id}`
      ? "send"
      : busyId === `friend-cancel:${user.id}`
        ? "cancel"
        : incomingRequestId && busyId === `request:${incomingRequestId}:accept`
          ? "accept"
          : incomingRequestId && busyId === `request:${incomingRequestId}:reject`
            ? "reject"
            : null;
  /** 관계 칩 — 누구인지·어떤 관계인지 한눈에 (나 / 친구 / 요청됨 / 나에게 요청) */
  const relationChip: { label: string; tone: "brand" | "neutral" } | null = isSelf
    ? { label: t("cm_friend_my_profile_badge"), tone: "neutral" }
    : cta?.kind === "friend"
      ? { label: t("cm_friend_cta_friend"), tone: "brand" }
      : cta?.kind === "pending_outgoing"
        ? { label: t("cm_friend_chip_requested"), tone: "neutral" }
        : cta?.kind === "pending_incoming"
          ? { label: t("cm_friend_chip_incoming"), tone: "brand" }
          : null;

  const openRow = () => {
    if (friendActions) {
      friendActions.onOpenProfile(user);
      return;
    }
    if (cannotMessage) return;
    void onStartDirectChat(user.id);
  };

  return (
    <div className="flex w-full items-center gap-2 px-3 py-2">
      <button
        type="button"
        disabled={friendActions ? false : cannotMessage || Boolean(busyId) || bChat}
        onClick={openRow}
        onPointerEnter={() => {
          if (prefetchOnceRef.current) return;
          prefetchOnceRef.current = true;
          onPrefetchDirectRoom(user.id);
        }}
        className={ui.rowButton}
      >
        <SamarketThumbnail
          src={avatarSrc}
          size={44}
          roundedClassName="rounded-full"
          className={ui.avatar}
          fallbackSrc=""
          fallbackNode={<span className={ui.initial} style={{ color: ui.secondaryColor }}>{initial}</span>}
        />
        <div className="min-w-0 flex-1">
          <p className={ui.name} style={{ color: ui.primaryColor }}>
            <span className="truncate">
              {user.matchType === "name" ? (
                <MessengerSearchHighlightText text={user.displayName} ranges={user.highlightRanges} />
              ) : (
                user.displayName
              )}
            </span>
            {relationChip ? (
              <span
                className={`${ui.chip} ${relationChip.tone === "brand" ? ui.chipBrand : ui.chipNeutral}`}
              >
                {relationChip.label}
              </span>
            ) : null}
          </p>
          {publicIdLabel ? (
            <p className={ui.sub} style={{ color: ui.secondaryColor }}>
              <MessengerSearchHighlightText
                text={user.publicId ?? ""}
                ranges={user.matchType === "name" ? [] : user.highlightRanges}
                prefix="@"
              />
            </p>
          ) : null}
        </div>
      </button>
      {cta && friendActions && !isSelf ? (
        blocked || cannotMessage ? (
          <span className={ui.note} style={{ color: ui.secondaryColor }}>
            {t("cm_social_cannot_start_chat")}
          </span>
        ) : (
          <MessengerFriendRelationCta
            cta={cta}
            layout="row"
            busy={ctaBusy}
            surface={surface}
            disabled={Boolean(busyId) && ctaBusy === null}
            peerLabel={user.displayName}
            onSend={() => friendActions.onSend(user.id)}
            onCancel={() => friendActions.onCancel(user.id)}
            onAccept={incomingRequestId ? () => friendActions.onRespond(incomingRequestId, "accept", user.displayName) : undefined}
            onReject={incomingRequestId ? () => friendActions.onRespond(incomingRequestId, "reject", user.displayName) : undefined}
            onMessage={() => onStartDirectChat(user.id)}
          />
        )
      ) : cannotMessage ? (
        <span className={ui.note} style={{ color: ui.secondaryColor }}>
          {t("cm_social_cannot_start_chat")}
        </span>
      ) : bChat ? (
        <span className={ui.ellipsis} style={{ color: ui.secondaryColor }}>…</span>
      ) : null}
    </div>
  );
}
