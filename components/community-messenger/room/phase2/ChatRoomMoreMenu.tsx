"use client";

import {
  Archive,
  Ban,
  Bell,
  BellOff,
  CheckCircle2,
  File as FileIcon,
  Flag,
  Image as ImageIcon,
  LogOut,
  Search,
  UserPlus,
} from "lucide-react";
import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { CommunityMessengerPeerPresenceSnapshot } from "@/lib/community-messenger/types";
import {
  formatMessengerTradeDockPriceLine,
  messengerTradeDockLine1,
  MessengerTradeProductDockRow,
} from "@/components/community-messenger/room/phase2/MessengerTradeProductDockRow";
import { formatMessengerPeerPresenceLine } from "@/lib/community-messenger/realtime/presence/format-messenger-peer-presence-line";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";

export type RoomType = "direct" | "trade";

/** requested = 내가 보낸 요청 대기 · incoming = 상대가 보낸 요청 대기 */
export type Relation = "none" | "requested" | "incoming" | "accepted";

export type Product = {
  id: string;
  title: string;
  price: number;
  thumbnailUrl?: string | null;
  status: "selling" | "inquiring" | "reserved" | "sold";
  allow_call: boolean;
  /** 가격 통화 PHP·KRW — 글 meta.currency (한국 주소 지원 3단계). 없으면 PHP */
  currency?: string;
  /** 숨김·삭제된 글(판매자 본인 제외) — 「볼 수 없는 글이에요」, 상세로 가지 않음 · 판정 `useTradeRoomListingUnavailable` (설계 G1) */
  unavailable?: boolean;
};

export type OtherUserProfile = {
  id: string;
  nickname: string;
  avatarUrl?: string | null;
  mannerScore: number;
  /** 헤더와 동일: `useCommunityMessengerPeerPresence` 결과를 넘기면 실시간 반영 */
  peerPresence?: CommunityMessengerPeerPresenceSnapshot | null;
  /** @deprecated `peerPresence`가 없을 때만(스토리북 등) */
  isOnline?: boolean;
};

export type TradeRoomContext = {
  product: Product;
  sellerId: string;
  buyerId: string;
  viewerRole: "seller" | "buyer";
};

export type DeliveryStoreMenuSummary = {
  storeName: string;
  statusLabel?: string | null;
  addressLine?: string | null;
};

/** 점세개 상단 프로필 — 배달 주문 방에서 peer 대신 매장/주문자 단일 소스 */
export type ChatRoomMenuProfileOverride = {
  nickname: string;
  avatarUrl?: string | null;
  avatarShape?: "circle" | "store_rect";
  /** 매장 프로필이면 매너 배터리 숨김 */
  hideMannerBattery?: boolean;
  mannerScore?: number;
  buyerTrustPercent?: number | null;
};

export type ChatRoomMoreMenuProps = {
  roomType: RoomType;
  relation: Relation;
  otherUser: OtherUserProfile;
  isMuted: boolean;
  isArchived: boolean;
  tradeContext?: TradeRoomContext;
  /** 배달·주문: 매장 요약(구매자 점세개) */
  deliveryStoreSummary?: DeliveryStoreMenuSummary;
  menuProfile?: ChatRoomMenuProfileOverride;
  disableMuteToggle?: boolean;
  disableArchiveToggle?: boolean;
  disableLeaveRoom?: boolean;
  disableFriendRequest?: boolean;
  /** P2 — initiator hides Add Contact row on general direct rooms */
  hidePeerSocialAdd?: boolean;
  /** 거래방 — slide 상세(채팅 유지) */
  onOpenProductDetail?: (postId: string) => void;
  onSearch: () => void;
  onOpenMediaFiles: () => void;
  /** Secondary path — file send (removed from + primary attachment). */
  onSendFile?: () => void;
  onFriendRequest: () => void;
  /** relation=requested — 보낸 요청 취소(확인은 호출 측) */
  onCancelFriendRequest?: () => void;
  /** relation=incoming — 받은 요청 수락 */
  onAcceptFriendRequest?: () => void;
  onToggleMute: () => void;
  onToggleArchive: () => void;
  onLeaveRoom: () => void;
  /** 방 신고 — 기존 메신저 신고 원장(`community_messenger_reports`) */
  onReportRoom?: () => void;
  /** 상대 차단 — 차단 SSOT. 배달 주문 방은 호출부가 넘기지 않는다 */
  onBlockPeer?: () => void;
  disableBlockPeer?: boolean;
};

function mannerTemperatureLabel(score0to100: number): string {
  const s = Math.max(0, Math.min(100, Number.isFinite(score0to100) ? score0to100 : 50));
  const c = 36.5 + (s - 50) * 0.03;
  return `${c.toFixed(1)}°C`;
}

function mannerAccentClass(score0to100: number): string {
  const s = Math.max(0, Math.min(100, Number.isFinite(score0to100) ? score0to100 : 50));
  if (s < 30) return "text-red-600 bg-red-50";
  if (s < 70) return "text-amber-700 bg-amber-50";
  return "text-emerald-700 bg-emerald-50";
}

function mannerFillClass(score0to100: number): string {
  const s = Math.max(0, Math.min(100, Number.isFinite(score0to100) ? score0to100 : 50));
  if (s < 30) return "bg-red-500";
  if (s < 70) return "bg-amber-500";
  return "bg-emerald-500";
}

function peerPresenceStatusDotClass(
  peerPresence: CommunityMessengerPeerPresenceSnapshot | null | undefined,
  legacyOnline?: boolean
): string {
  const state = peerPresence?.state;
  if (state === "online") return "bg-emerald-500";
  if (state === "away") return "bg-amber-400";
  if (state === "offline") return "bg-zinc-400";
  if (legacyOnline === true) return "bg-emerald-500";
  if (legacyOnline === false) return "bg-zinc-400";
  return "bg-zinc-400";
}

/**
 * 메뉴 행 (팝업 SSOT T3) — 48 · 16 · overlay 색 · 눌림 배경만 · 비활성 회색 글자 (opacity 금지).
 */
function menuRowClass(interactive: boolean, danger = false): string {
  const tone = danger ? "text-[color:var(--overlay-danger)]" : "text-[color:var(--overlay-text-primary)]";
  const base = `flex w-full min-h-[48px] items-center gap-3 border-b border-[color:var(--overlay-border)] px-3 py-2.5 text-left text-[length:var(--overlay-body-1-size)] leading-[1.4] disabled:cursor-not-allowed disabled:text-[color:var(--overlay-text-secondary)]`;
  return interactive
    ? `${base} ${tone} transition-colors active:bg-[color:var(--overlay-secondary)]`
    : `${base} text-[color:var(--overlay-text-secondary)]`;
}

export function ChatRoomMoreMenu(props: ChatRoomMoreMenuProps) {
  const { t } = useI18n();
  const productStatusLabel = useMemo(
    (): Record<Product["status"], string> => ({
      selling: t("cm_ui_trade_product_selling"),
      inquiring: t("cm_ui_trade_product_inquiring"),
      reserved: t("cm_ui_trade_product_reserved"),
      sold: t("cm_ui_trade_product_sold"),
    }),
    [t]
  );
  const {
    roomType,
    relation,
    otherUser,
    isMuted,
    isArchived,
    tradeContext,
    deliveryStoreSummary,
    menuProfile,
    disableMuteToggle = false,
    disableArchiveToggle = false,
    disableLeaveRoom = false,
    disableFriendRequest = false,
    hidePeerSocialAdd = false,
    onSearch,
    onOpenMediaFiles,
    onSendFile,
    onFriendRequest,
    onCancelFriendRequest,
    onAcceptFriendRequest,
    onToggleMute,
    onToggleArchive,
    onLeaveRoom,
    onReportRoom,
    onBlockPeer,
    disableBlockPeer = false,
  } = props;

  const presenceLine =
    otherUser.peerPresence != null
      ? formatMessengerPeerPresenceLine(otherUser.peerPresence)
      : otherUser.isOnline === true
        ? t("cm_ui_online")
        : otherUser.isOnline === false
          ? t("cm_ui_offline")
          : formatMessengerPeerPresenceLine(null);

  const friendLabelNone = roomType === "direct" ? t("cm_ui_add_friend") : t("cm_ui_friend_request");


  const profileNickname = menuProfile?.nickname?.trim() || otherUser.nickname;
  const profileAvatarUrl = menuProfile?.avatarUrl ?? otherUser.avatarUrl;
  const profileMannerScore = menuProfile?.mannerScore ?? otherUser.mannerScore;
  const profileAvatarRounded =
    menuProfile?.avatarShape === "store_rect" ? "rounded-ui-rect" : "rounded-full";
  const showMannerBattery = !menuProfile?.hideMannerBattery;

  return (
    <div className="delivery-ui flex flex-col pb-[var(--safe-bottom)]">
      <div className="border-b border-[color:var(--overlay-border)] px-3 py-3">
        <div className="flex items-center gap-3">
          <div
            className={`relative h-12 w-12 shrink-0 overflow-hidden ${profileAvatarRounded} bg-[color:var(--sm-color-primary-soft)] ring-1 ring-[color:var(--overlay-border)]`}
          >
            <SamarketThumbnail
              src={profileAvatarUrl}
              size={48}
              roundedClassName={profileAvatarRounded}
              className="bg-[color:var(--sm-color-primary-soft)] ring-1 ring-[color:var(--overlay-border)]"
              fallbackSrc=""
              fallbackNode={
                <div className="flex h-full w-full items-center justify-center text-[length:var(--overlay-body-2-size)] font-semibold text-[color:var(--overlay-primary)]">
                  {profileNickname.trim().slice(0, 1) || "?"}
                </div>
              }
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[length:var(--overlay-body-1-size)] font-semibold text-[color:var(--overlay-text-primary)]">{profileNickname}</p>
            <div className="mt-0.5 flex items-center gap-1.5 text-[length:var(--overlay-caption-size)] text-[color:var(--overlay-text-secondary)]">
              <span
                className={`inline-block h-2 w-2 shrink-0 rounded-full ${peerPresenceStatusDotClass(
                  otherUser.peerPresence,
                  otherUser.isOnline
                )}`}
                aria-hidden
              />
              <span>{presenceLine}</span>
            </div>
            {showMannerBattery ? (
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1.5 max-w-[120px] flex-1 overflow-hidden rounded-full bg-[color:var(--overlay-border)]" aria-hidden>
                  <div
                    className={`h-full rounded-full ${mannerFillClass(profileMannerScore)}`}
                    style={{ width: `${Math.max(0, Math.min(100, profileMannerScore))}%` }}
                  />
                </div>
                <span
                  className={`rounded-[length:var(--overlay-radius-sm)] px-1.5 py-0.5 text-[length:var(--overlay-caption-size)] font-semibold ${mannerAccentClass(
                    profileMannerScore
                  )}`}
                >
                  {mannerTemperatureLabel(profileMannerScore)}
                </span>
              </div>
            ) : menuProfile?.buyerTrustPercent != null ? (
              <p className="mt-1 text-[length:var(--overlay-caption-size)] font-semibold text-[color:var(--overlay-primary)]">
                신뢰 {menuProfile.buyerTrustPercent}%
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {deliveryStoreSummary ? (
        <div className="border-b border-[color:var(--overlay-border)] px-3 py-2.5">
          <div className="rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-secondary)] p-2.5">
            <p className="truncate text-[length:var(--overlay-body-2-size)] font-bold text-[color:var(--overlay-text-primary)]">
              {deliveryStoreSummary.storeName}
            </p>
            {deliveryStoreSummary.statusLabel?.trim() ? (
              <p className="mt-1 text-[length:var(--overlay-caption-size)] font-semibold text-[color:var(--overlay-primary)]">
                {deliveryStoreSummary.statusLabel.trim()}
              </p>
            ) : null}
            {deliveryStoreSummary.addressLine?.trim() ? (
              <p className="mt-0.5 line-clamp-2 text-[length:var(--overlay-caption-size)] leading-[1.35] text-[color:var(--overlay-text-secondary)]">
                {deliveryStoreSummary.addressLine.trim()}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {roomType === "trade" && tradeContext?.product.unavailable ? (
        <div className="border-b border-[color:var(--overlay-border)] px-3 py-2.5" data-trade-chat-product-unavailable="1">
          <p className="truncate text-[14px] font-semibold text-[color:var(--overlay-text-secondary)]">
            {t("trade_unavailable_title")}
          </p>
        </div>
      ) : roomType === "trade" && tradeContext ? (
        <div className="border-b border-[color:var(--overlay-border)] px-3 py-2.5">
          <MessengerTradeProductDockRow
            thumbnailUrl={tradeContext.product.thumbnailUrl}
            line1={messengerTradeDockLine1(tradeContext.product.title, undefined)}
            line2={formatMessengerTradeDockPriceLine(
              tradeContext.product.price,
              tradeContext.product.currency || "PHP",
              productStatusLabel[tradeContext.product.status]
            )}
            detailHref={`/post/${encodeURIComponent(tradeContext.product.id)}`}
            productLabel={tradeContext.product.title}
            onOpenProductDetail={props.onOpenProductDetail}
          />
        </div>
      ) : null}

      <nav className="flex flex-col" aria-label={t("cm_ui_chat_room_menu")}>
        <button type="button" onClick={onSearch} className={menuRowClass(true)}>
          <Search className="h-[18px] w-[18px] shrink-0 text-[color:var(--overlay-primary)]" strokeWidth={2} aria-hidden />
          <span className="min-w-0 flex-1 font-medium">{t("cm_ui_search_in_chat")}</span>
        </button>
        <button type="button" onClick={onOpenMediaFiles} className={menuRowClass(true)}>
          <ImageIcon className="h-[18px] w-[18px] shrink-0 text-[color:var(--overlay-primary)]" strokeWidth={2} aria-hidden />
          <span className="min-w-0 flex-1 font-medium">{t("cm_ui_view_photo_file")}</span>
        </button>
        {onSendFile ? (
          <button type="button" onClick={onSendFile} className={menuRowClass(true)}>
            <FileIcon className="h-[18px] w-[18px] shrink-0 text-[color:var(--overlay-primary)]" strokeWidth={2} aria-hidden />
            <span className="min-w-0 flex-1 font-medium">
              {t("cm_ui_file")}
            </span>
          </button>
        ) : null}

        {!hidePeerSocialAdd && relation === "none" ? (
          <button
            type="button"
            onClick={onFriendRequest}
            disabled={disableFriendRequest}
            className={menuRowClass(!disableFriendRequest)}
          >
            <UserPlus className="h-[18px] w-[18px] shrink-0 text-[color:var(--overlay-primary)]" strokeWidth={2} aria-hidden />
            <span className="min-w-0 flex-1 font-medium">{friendLabelNone}</span>
          </button>
        ) : !hidePeerSocialAdd && relation === "requested" && onCancelFriendRequest ? (
          <button
            type="button"
            onClick={onCancelFriendRequest}
            disabled={disableFriendRequest}
            className={menuRowClass(!disableFriendRequest)}
          >
            <UserPlus className="h-[18px] w-[18px] shrink-0 text-[color:var(--overlay-text-secondary)]" strokeWidth={2} aria-hidden />
            <span className="min-w-0 flex-1 font-medium">{t("cm_friend_menu_requested_cancel")}</span>
          </button>
        ) : relation === "incoming" && onAcceptFriendRequest ? (
          <button
            type="button"
            onClick={onAcceptFriendRequest}
            disabled={disableFriendRequest}
            className={menuRowClass(!disableFriendRequest)}
          >
            <UserPlus className="h-[18px] w-[18px] shrink-0 text-[color:var(--overlay-primary)]" strokeWidth={2} aria-hidden />
            <span className="min-w-0 flex-1 font-medium">{t("cm_friend_menu_accept_incoming")}</span>
          </button>
        ) : relation === "accepted" ? (
          <div className={menuRowClass(false)}>
            <CheckCircle2 className="h-[18px] w-[18px] shrink-0 text-[color:var(--overlay-primary)]" strokeWidth={2} aria-hidden />
            <span className="min-w-0 flex-1 font-medium">{t("cm_ui_is_friend")}</span>
          </div>
        ) : null}

        {/* 통화(음성·영상·휴대폰)는 헤더 📞 선택 시트 하나로만 — 통화 버튼 통합 2판 (Owner 2026-11-12) */}

        <button
          type="button"
          onClick={onToggleMute}
          disabled={disableMuteToggle}
          className={menuRowClass(!disableMuteToggle)}
        >
          {isMuted ? (
            <Bell className="h-[18px] w-[18px] shrink-0 text-[color:var(--overlay-primary)]" strokeWidth={2} aria-hidden />
          ) : (
            <BellOff className="h-[18px] w-[18px] shrink-0 text-[color:var(--overlay-primary)]" strokeWidth={2} aria-hidden />
          )}
          <span className="min-w-0 flex-1 font-medium">
            {isMuted ? t("cm_ui_turn_on_room_notifications") : t("cm_ui_turn_off_room_notifications")}
          </span>
        </button>
        <button
          type="button"
          onClick={onToggleArchive}
          disabled={disableArchiveToggle}
          className={menuRowClass(!disableArchiveToggle)}
        >
          <Archive className="h-[18px] w-[18px] shrink-0 text-[color:var(--overlay-primary)]" strokeWidth={2} aria-hidden />
          <span className="min-w-0 flex-1 font-medium">{isArchived ? t("cm_ui_unarchive") : t("cm_ui_archive_chat_room")}</span>
        </button>
        {onReportRoom ? (
          <button type="button" onClick={onReportRoom} className={menuRowClass(true)}>
            <Flag className="h-[18px] w-[18px] shrink-0 text-[color:var(--overlay-primary)]" strokeWidth={2} aria-hidden />
            <span className="min-w-0 flex-1 font-medium">{t("nav_messenger_report")}</span>
          </button>
        ) : null}
        {onBlockPeer ? (
          <button
            type="button"
            onClick={onBlockPeer}
            disabled={disableBlockPeer}
            className={menuRowClass(!disableBlockPeer, true)}
          >
            <Ban className="h-[18px] w-[18px] shrink-0" strokeWidth={2} aria-hidden />
            <span className="min-w-0 flex-1 font-medium">{t("common_block")}</span>
          </button>
        ) : null}
        <button
          type="button"
          onClick={onLeaveRoom}
          disabled={disableLeaveRoom}
          className={`${menuRowClass(!disableLeaveRoom, true)} border-b-0`}
        >
          <LogOut className="h-[18px] w-[18px] shrink-0" strokeWidth={2} aria-hidden />
          <span className="min-w-0 flex-1 font-medium">{t("cm_ui_leave_chat_room")}</span>
        </button>
      </nav>
    </div>
  );
}

/** 스토리북·로컬 미리보기용 */
export const MOCK_CHAT_ROOM_MORE_MENU_DIRECT: ChatRoomMoreMenuProps = {
  roomType: "direct",
  relation: "none",
  otherUser: {
    id: "u1",
    nickname: "라이트유저",
    avatarUrl: null,
    isOnline: true,
    mannerScore: 72,
  },
  isMuted: false,
  isArchived: false,
  onSearch: () => {},
  onOpenMediaFiles: () => {},
  onFriendRequest: () => {},
  onToggleMute: () => {},
  onToggleArchive: () => {},
  onLeaveRoom: () => {},
};

export const MOCK_CHAT_ROOM_MORE_MENU_TRADE: ChatRoomMoreMenuProps = {
  roomType: "trade",
  relation: "requested",
  otherUser: {
    id: "u2",
    nickname: "거래상대",
    avatarUrl: null,
    isOnline: false,
    mannerScore: 28,
  },
  isMuted: true,
  isArchived: false,
  tradeContext: {
    sellerId: "s1",
    buyerId: "b1",
    viewerRole: "buyer",
    product: {
      id: "p1",
      title: "아이폰 15 프로 실버 256GB",
      price: 45000,
      thumbnailUrl: null,
      status: "selling",
      allow_call: true,
    },
  },
  onSearch: () => {},
  onOpenMediaFiles: () => {},
  onFriendRequest: () => {},
  onToggleMute: () => {},
  onToggleArchive: () => {},
  onLeaveRoom: () => {},
};
