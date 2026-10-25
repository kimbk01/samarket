"use client";

import { useCallback, useRef, useState, type RefObject } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MessengerHomeBottomSheetShell, SettingsToggleRow } from "@/components/community-messenger/MessengerSheetUi";
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
  onSend: (userId: string) => void;
  onCancel: (userId: string) => void;
  onRespond: (requestId: string, action: "accept" | "reject", peerLabel: string) => void;
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
  localSettings,
  updateLocalSetting,
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
        <div className="flex shrink-0 items-center justify-between border-b border-[color:var(--messenger-divider)] px-3 py-2.5">
          <p className="sam-text-body-lg font-semibold" style={{ color: "var(--messenger-text)" }}>
            {t("cm_ui_new_conversation")}
          </p>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-ui-rect text-[color:var(--messenger-text-secondary)] active:bg-[color:var(--messenger-primary-soft)]"
            aria-label={t("nav_close")}
            onClick={onClose}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex shrink-0 border-b border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface-muted)]">
          {TAB_ORDER.map((tab) => {
            const disabled = tab === "contacts" && !localSettings.phoneFriendAddEnabled;
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
                className={`relative min-w-0 flex-1 px-1 py-2.5 sam-text-helper font-medium ${
                  disabled ? "opacity-40" : ""
                } ${active ? "font-semibold" : ""}`}
                style={{ color: active ? "var(--messenger-text)" : "var(--messenger-text-secondary)" }}
              >
                <span className="line-clamp-2">{t(tabLabel(tab))}</span>
                {active ? (
                  <span
                    className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full"
                    style={{ backgroundColor: "var(--messenger-primary)" }}
                  />
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[color:var(--messenger-bg)] px-3 pb-4 pt-3">
          {friendAddTab === "contacts" ? (
            <div className="space-y-2">
              <p className="sam-text-helper" style={{ color: "var(--messenger-text-secondary)" }}>
                연락처 동기화는 모바일 앱·지원 브라우저에서 사용할 수 있습니다.
              </p>
              <div className="overflow-hidden rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] shadow-[var(--messenger-shadow-soft)]">
                <SettingsToggleRow
                  title={t("cm_ui_add_friend_by_phone")}
                  description={t("cm_ui_use_contacts_tab")}
                  checked={localSettings.phoneFriendAddEnabled}
                  onChange={(next) => updateLocalSetting("phoneFriendAddEnabled", next)}
                />
                <SettingsToggleRow
                  title={t("cm_ui_auto_add_contacts")}
                  description={t("cm_ui_auto_apply_mobile_integration")}
                  checked={localSettings.contactAutoAddEnabled}
                  onChange={(next) => updateLocalSetting("contactAutoAddEnabled", next)}
                />
              </div>
              <p
                className="rounded-[var(--messenger-radius-md)] border border-dashed border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface-muted)] px-3 py-3 text-center sam-text-helper"
                style={{ color: "var(--messenger-text-secondary)" }}
              >
                웹에서는 ID 검색 탭으로 바로 추가할 수 있습니다.
              </p>
            </div>
          ) : null}

          {friendAddTab === "id" ? (
            <div className="space-y-3">
              <div>
                <div className="flex justify-end sam-text-xxs tabular-nums" style={{ color: "var(--messenger-text-secondary)" }}>
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
                  className="w-full rounded-ui-rect border border-transparent bg-[color:var(--messenger-primary-soft)] px-2 py-2 text-[14px] font-normal leading-[1.5] outline-none transition-[border,box-shadow] placeholder:text-[13px] placeholder:font-normal placeholder:leading-[1.45] placeholder:text-[color:var(--messenger-text-secondary)] focus:border-[color:var(--messenger-primary)] focus:bg-[color:var(--messenger-surface)] focus:ring-1 focus:ring-[color:var(--messenger-primary)]"
                  style={{ color: "var(--messenger-text)" }}
                />
                {searchKeyword.trim().length > 0 &&
                searchKeyword.trim().length < COMMUNITY_MESSENGER_USER_SEARCH_MIN_LENGTH ? (
                  <p className="mt-2 sam-text-xxs" style={{ color: "var(--messenger-text-secondary)" }}>
                    {t("cm_ui_enter_keyword_then_search")}
                  </p>
                ) : null}
              </div>
              <div className="divide-y divide-[color:var(--messenger-divider)] overflow-hidden rounded-ui-rect border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] shadow-[var(--messenger-shadow-soft)]">
                {searchBusy ? (
                  <p className="px-3 py-4 text-center sam-text-helper" style={{ color: "var(--messenger-text-secondary)" }}>
                    {t("common_loading")}
                  </p>
                ) : searchResults.length === 0 ? (
                  <p className="px-3 py-4 text-center sam-text-helper" style={{ color: "var(--messenger-text-secondary)" }}>
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
                    />
                  ))
                )}
              </div>
            </div>
          ) : null}

          {friendAddTab === "invite" ? (
            <div className="space-y-3">
              <p className="sam-text-helper" style={{ color: "var(--messenger-text-secondary)" }}>
                이 링크를 공유하면 상대가 메신저에서 나를 찾을 수 있습니다. QR 스캔은 동일 링크를 사용합니다.
              </p>
              <div className="rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-primary-soft)] px-3 py-2.5">
                <p className="sam-text-xxs font-medium uppercase tracking-wide" style={{ color: "var(--messenger-text-secondary)" }}>
                  초대 URL
                </p>
                <p className="mt-1 break-all sam-text-helper leading-snug" style={{ color: "var(--messenger-text)" }}>
                  {inviteUrl}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void copyInvite()}
                className="w-full rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-primary-soft)] py-2.5 sam-text-body font-semibold active:opacity-90"
                style={{ color: "var(--messenger-primary)" }}
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

/** 사용자 검색 결과 행 — 친구 추가 시트·친구 탭 인라인 검색 공용 */
export function MessengerFriendSearchResultRow({
  user,
  busyId,
  onPrefetchDirectRoom,
  onStartDirectChat,
  viewerUserId,
  friendActions,
}: {
  user: CommunityMessengerUserSearchResult;
  busyId: string | null;
  onPrefetchDirectRoom: (userId: string) => void;
  onStartDirectChat: (userId: string) => void;
  viewerUserId: string | null;
  friendActions?: MessengerFriendAddSheetFriendActions;
}) {
  const { t } = useI18n();
  const prefetchOnceRef = useRef(false);
  const avatarSrc = user.avatarUrl?.trim() ? user.avatarUrl.trim() : null;
  const initial = user.displayName.trim().slice(0, 1) || "?";
  const publicIdLabel = user.publicId ? `@${user.publicId}` : "";
  const bChat = busyId === `room:${user.id}`;
  const cannotMessage = !user.canMessage;
  const isSelf = Boolean(viewerUserId && viewerUserId === user.id);
  const blocked = user.isBlockedByMe || user.isBlockedByPeer;
  const cta = friendActions
    ? resolveMessengerPeerSocialCta({ id: user.id, isFriend: user.isFriend, blocked }, friendActions.pendingSets)
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
        className="-my-1 -ml-1 flex min-w-0 flex-1 items-center gap-2.5 rounded-ui-rect py-1 pl-1 text-left transition-colors active:bg-[color:var(--messenger-primary-soft)] disabled:opacity-40"
      >
        <SamarketThumbnail
          src={avatarSrc}
          size={44}
          roundedClassName="rounded-full"
          className="bg-[color:var(--messenger-surface-muted)] ring-1 ring-[color:var(--messenger-primary-soft-2)]"
          fallbackSrc=""
          fallbackNode={<span className="sam-text-body-secondary font-semibold" style={{ color: "var(--messenger-text-secondary)" }}>{initial}</span>}
        />
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-1.5 sam-text-body font-semibold" style={{ color: "var(--messenger-text)" }}>
            <span className="truncate">
              {user.matchType === "name" ? (
                <MessengerSearchHighlightText text={user.displayName} ranges={user.highlightRanges} />
              ) : (
                user.displayName
              )}
            </span>
            {relationChip ? (
              <span
                className={`shrink-0 rounded-full px-1.5 py-px text-[11px] font-semibold leading-4 ${
                  relationChip.tone === "brand"
                    ? "bg-[color:var(--messenger-primary-soft)] text-[color:var(--messenger-primary)]"
                    : "bg-[color:var(--messenger-surface-muted)] text-[color:var(--messenger-text-secondary)]"
                }`}
              >
                {relationChip.label}
              </span>
            ) : null}
          </p>
          {publicIdLabel ? (
            <p className="truncate sam-text-xxs" style={{ color: "var(--messenger-text-secondary)" }}>
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
          <span className="max-w-[6.5rem] shrink-0 text-right sam-text-xxs leading-tight" style={{ color: "var(--messenger-text-secondary)" }}>
            {t("cm_social_cannot_start_chat")}
          </span>
        ) : (
          <MessengerFriendRelationCta
            cta={cta}
            layout="row"
            busy={ctaBusy}
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
        <span className="max-w-[6.5rem] shrink-0 text-right sam-text-xxs leading-tight" style={{ color: "var(--messenger-text-secondary)" }}>
          {t("cm_social_cannot_start_chat")}
        </span>
      ) : bChat ? (
        <span className="shrink-0 sam-text-xxs" style={{ color: "var(--messenger-text-secondary)" }}>…</span>
      ) : null}
    </div>
  );
}
