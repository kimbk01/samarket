"use client";

import {
  Archive,
  Bell,
  BellOff,
  CheckCircle2,
  Image as ImageIcon,
  LogOut,
  Phone,
  Search,
  UserPlus,
  Video,
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

export type RoomType = "direct" | "trade";

export type Relation = "none" | "requested" | "accepted";

export type Product = {
  id: string;
  title: string;
  price: number;
  thumbnailUrl?: string | null;
  status: "selling" | "inquiring" | "reserved" | "sold";
  allow_call: boolean;
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
  /** 배달·주문 방 — 영상 통화 메뉴 숨김 */
  hideVideoCall?: boolean;
  /** 거래: `trade_chat_call_policy === voice_and_video` 일 때만 true */
  tradeVideoCallEnabled?: boolean;
  disableVoiceCall?: boolean;
  disableVideoCall?: boolean;
  disableMuteToggle?: boolean;
  disableArchiveToggle?: boolean;
  disableLeaveRoom?: boolean;
  disableFriendRequest?: boolean;
  onSearch: () => void;
  onOpenMediaFiles: () => void;
  onFriendRequest: () => void;
  onVoiceCall: () => void;
  onVideoCall: () => void;
  onToggleMute: () => void;
  onToggleArchive: () => void;
  onLeaveRoom: () => void;
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

function listRowClass(interactive: boolean): string {
  const base =
    "flex w-full min-h-[48px] items-center gap-3 border-b border-[color:var(--cm-room-divider)] px-3 py-2.5 text-left sam-text-body text-[color:var(--cm-room-text)]";
  return interactive
    ? `${base} active:bg-[color:var(--cm-room-primary-soft)]`
    : `${base} opacity-55`;
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
    hideVideoCall = false,
    tradeVideoCallEnabled = false,
    disableVoiceCall = false,
    disableVideoCall = false,
    disableMuteToggle = false,
    disableArchiveToggle = false,
    disableLeaveRoom = false,
    disableFriendRequest = false,
    onSearch,
    onOpenMediaFiles,
    onFriendRequest,
    onVoiceCall,
    onVideoCall,
    onToggleMute,
    onToggleArchive,
    onLeaveRoom,
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

  const showVoice =
    roomType === "direct" || (roomType === "trade" && Boolean(tradeContext?.product.allow_call));

  const showVideo =
    !hideVideoCall &&
    (roomType === "direct" || (roomType === "trade" && Boolean(tradeContext?.product.allow_call) && tradeVideoCallEnabled));

  const profileNickname = menuProfile?.nickname?.trim() || otherUser.nickname;
  const profileAvatarUrl = menuProfile?.avatarUrl ?? otherUser.avatarUrl;
  const profileMannerScore = menuProfile?.mannerScore ?? otherUser.mannerScore;
  const profileAvatarRounded =
    menuProfile?.avatarShape === "store_rect" ? "rounded-ui-rect" : "rounded-full";
  const showMannerBattery = !menuProfile?.hideMannerBattery;

  return (
    <div className="delivery-ui flex flex-col pb-[env(safe-area-inset-bottom,0px)]">
      <div className="border-b border-[color:var(--cm-room-divider)] px-3 py-3">
        <div className="flex items-center gap-3">
          <div
            className={`relative h-12 w-12 shrink-0 overflow-hidden ${profileAvatarRounded} bg-[color:var(--cm-room-primary-soft)] ring-1 ring-[color:var(--cm-room-divider)]`}
          >
            {profileAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profileAvatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center sam-text-body-secondary font-semibold text-[color:var(--cm-room-primary)]">
                {profileNickname.trim().slice(0, 1) || "?"}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-[color:var(--cm-room-text)]">{profileNickname}</p>
            <div className="mt-0.5 flex items-center gap-1.5 sam-text-xxs text-[color:var(--cm-room-text-muted)]">
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
                <div className="h-1.5 max-w-[120px] flex-1 overflow-hidden rounded-full bg-black/10" aria-hidden>
                  <div
                    className={`h-full rounded-full ${mannerFillClass(profileMannerScore)}`}
                    style={{ width: `${Math.max(0, Math.min(100, profileMannerScore))}%` }}
                  />
                </div>
                <span
                  className={`rounded px-1.5 py-0.5 sam-text-xxs font-semibold ${mannerAccentClass(
                    profileMannerScore
                  )}`}
                >
                  {mannerTemperatureLabel(profileMannerScore)}
                </span>
              </div>
            ) : menuProfile?.buyerTrustPercent != null ? (
              <p className="mt-1 sam-text-xxs font-semibold text-[color:var(--delivery-primary)]">
                신뢰 {menuProfile.buyerTrustPercent}%
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {deliveryStoreSummary ? (
        <div className="border-b border-[color:var(--cm-room-divider)] px-3 py-2.5">
          <div className="rounded-[var(--delivery-radius)] border border-[color:var(--delivery-chat-chrome-border)] bg-[color:var(--delivery-chat-chrome-surface)] p-2.5">
            <p className="truncate text-[13px] font-bold text-[color:var(--delivery-dark)]">
              {deliveryStoreSummary.storeName}
            </p>
            {deliveryStoreSummary.statusLabel?.trim() ? (
              <p className="mt-1 text-[11px] font-semibold text-[color:var(--delivery-primary)]">
                {deliveryStoreSummary.statusLabel.trim()}
              </p>
            ) : null}
            {deliveryStoreSummary.addressLine?.trim() ? (
              <p className="mt-0.5 line-clamp-2 text-[11px] leading-[1.35] text-[color:var(--delivery-mocha)]">
                {deliveryStoreSummary.addressLine.trim()}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {roomType === "trade" && tradeContext ? (
        <div className="border-b border-[color:var(--cm-room-divider)] px-3 py-2.5">
          <MessengerTradeProductDockRow
            thumbnailUrl={tradeContext.product.thumbnailUrl}
            line1={messengerTradeDockLine1(tradeContext.product.title, undefined)}
            line2={formatMessengerTradeDockPriceLine(
              tradeContext.product.price,
              "PHP",
              productStatusLabel[tradeContext.product.status]
            )}
            detailHref={`/post/${encodeURIComponent(tradeContext.product.id)}`}
            productLabel={tradeContext.product.title}
          />
        </div>
      ) : null}

      <nav className="flex flex-col" aria-label={t("cm_ui_chat_room_menu")}>
        <button type="button" onClick={onSearch} className={listRowClass(true)}>
          <Search className="h-[18px] w-[18px] shrink-0 text-[color:var(--cm-room-primary)]" strokeWidth={2} aria-hidden />
          <span className="min-w-0 flex-1 font-medium">{t("cm_ui_search_in_chat")}</span>
        </button>
        <button type="button" onClick={onOpenMediaFiles} className={listRowClass(true)}>
          <ImageIcon className="h-[18px] w-[18px] shrink-0 text-[color:var(--cm-room-primary)]" strokeWidth={2} aria-hidden />
          <span className="min-w-0 flex-1 font-medium">{t("cm_ui_view_photo_file")}</span>
        </button>

        {relation === "none" ? (
          <button
            type="button"
            onClick={onFriendRequest}
            disabled={disableFriendRequest}
            className={`${listRowClass(!disableFriendRequest)} disabled:opacity-40`}
          >
            <UserPlus className="h-[18px] w-[18px] shrink-0 text-[color:var(--cm-room-primary)]" strokeWidth={2} aria-hidden />
            <span className="min-w-0 flex-1 font-medium">{friendLabelNone}</span>
          </button>
        ) : relation === "requested" ? (
          <div className={listRowClass(false)} aria-disabled>
            <UserPlus className="h-[18px] w-[18px] shrink-0 text-[color:var(--cm-room-text-muted)]" strokeWidth={2} aria-hidden />
            <span className="min-w-0 flex-1 font-medium text-[color:var(--cm-room-text-muted)]">{t("cm_ui_pending")}</span>
          </div>
        ) : (
          <div className={listRowClass(false)}>
            <CheckCircle2 className="h-[18px] w-[18px] shrink-0 text-emerald-600" strokeWidth={2} aria-hidden />
            <span className="min-w-0 flex-1 font-medium text-[color:var(--cm-room-text)]">{t("cm_ui_is_friend")}</span>
          </div>
        )}

        {showVoice ? (
          <button
            type="button"
            onClick={onVoiceCall}
            disabled={disableVoiceCall}
            className={`${listRowClass(!disableVoiceCall)} disabled:opacity-40`}
          >
            <Phone className="h-[18px] w-[18px] shrink-0 text-[color:var(--cm-room-primary)]" strokeWidth={2} aria-hidden />
            <span className="min-w-0 flex-1 font-medium">{t("cm_ui_voice_call")}</span>
          </button>
        ) : null}

        {showVideo ? (
          <button
            type="button"
            onClick={onVideoCall}
            disabled={disableVideoCall}
            className={`${listRowClass(!disableVideoCall)} disabled:opacity-40`}
          >
            <Video className="h-[18px] w-[18px] shrink-0 text-[color:var(--cm-room-primary)]" strokeWidth={2} aria-hidden />
            <span className="min-w-0 flex-1 font-medium">{t("cm_ui_video_call")}</span>
          </button>
        ) : null}

        <button
          type="button"
          onClick={onToggleMute}
          disabled={disableMuteToggle}
          className={`${listRowClass(!disableMuteToggle)} disabled:opacity-40`}
        >
          {isMuted ? (
            <Bell className="h-[18px] w-[18px] shrink-0 text-[color:var(--cm-room-primary)]" strokeWidth={2} aria-hidden />
          ) : (
            <BellOff className="h-[18px] w-[18px] shrink-0 text-[color:var(--cm-room-primary)]" strokeWidth={2} aria-hidden />
          )}
          <span className="min-w-0 flex-1 font-medium">
            {isMuted ? t("cm_ui_turn_on_room_notifications") : t("cm_ui_turn_off_room_notifications")}
          </span>
        </button>
        <button
          type="button"
          onClick={onToggleArchive}
          disabled={disableArchiveToggle}
          className={`${listRowClass(!disableArchiveToggle)} disabled:opacity-40`}
        >
          <Archive className="h-[18px] w-[18px] shrink-0 text-[color:var(--cm-room-primary)]" strokeWidth={2} aria-hidden />
          <span className="min-w-0 flex-1 font-medium">{isArchived ? t("cm_ui_unarchive") : t("cm_ui_archive_chat_room")}</span>
        </button>
        <button
          type="button"
          onClick={onLeaveRoom}
          disabled={disableLeaveRoom}
          className={`${listRowClass(!disableLeaveRoom)} border-b-0 text-red-600 disabled:opacity-40`}
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
  onVoiceCall: () => {},
  onVideoCall: () => {},
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
  tradeVideoCallEnabled: false,
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
  onVoiceCall: () => {},
  onVideoCall: () => {},
  onToggleMute: () => {},
  onToggleArchive: () => {},
  onLeaveRoom: () => {},
};
