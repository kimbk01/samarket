"use client";

import { useRef } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MessengerSearchHighlightText } from "@/components/community-messenger/MessengerSearchHighlightText";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import type { CommunityMessengerUserSearchResult } from "@/lib/community-messenger/user-public-id-search";
import { resolveMessengerPeerSocialCta } from "@/lib/community-messenger/messenger-friend-add-cta";
import {
  MessengerFriendRelationCta,
  type MessengerFriendCtaBusy,
} from "@/components/community-messenger/friend-cta/MessengerFriendRelationCta";

/**
 * 친구가 된 경로 — DB `community_friend_requests.source` 허용값과 같다 (QR 친구 재감사 §2).
 * QR(`qr`)은 별도 함수(`cm_add_friend_via_qr`)라 여기 없다. `group` = 그룹 만들기·방 그룹 초대 중 추가 (DB S2 적용 2026-11-12).
 */
export type MessengerFriendAddSource = "id_search" | "contacts" | "profile" | "group";

/** 검색 결과 행 친구 CTA — 홈의 친구 요청 목록에서 계산한 상태 + 행동 */
export type MessengerFriendSearchFriendActions = {
  pendingSets: {
    outgoingPendingPeerIds: ReadonlySet<string>;
    incomingPendingByPeerId: ReadonlyMap<string, string>;
  };
  /** 처리 결과(성공 true)를 돌려주면 호출부가 성공 뒤 화면 정리(검색 카드 접기 등)를 할 수 있다 */
  /** source = 친구가 된 경로 — 반드시 호출처가 넘긴다 (QR 친구 재감사 D-A2: 기본값을 두면 다른 경로가 섞인다) */
  onSend: (userId: string, source: MessengerFriendAddSource) => void | Promise<boolean>;
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

/** 사용자 검색 결과 행 — 친구 탭 인라인 검색 (아이디 검색 → source `id_search`) */
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
  friendActions?: MessengerFriendSearchFriendActions;
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
            onSend={() => friendActions.onSend(user.id, "id_search")}
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
