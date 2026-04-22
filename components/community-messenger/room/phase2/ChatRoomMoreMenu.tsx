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

export type ChatRoomMoreMenuProps = {
  roomType: RoomType;
  relation: Relation;
  otherUser: OtherUserProfile;
  isMuted: boolean;
  isArchived: boolean;
  tradeContext?: TradeRoomContext;
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

const PRODUCT_STATUS_LABEL: Record<Product["status"], string> = {
  selling: "판매중",
  inquiring: "문의중",
  reserved: "예약중",
  sold: "거래완료",
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
  const {
    roomType,
    relation,
    otherUser,
    isMuted,
    isArchived,
    tradeContext,
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
        ? "온라인"
        : otherUser.isOnline === false
          ? "오프라인"
          : formatMessengerPeerPresenceLine(null);

  const friendLabelNone = roomType === "direct" ? "친구 추가" : "친구 신청";

  const showVoice =
    roomType === "direct" || (roomType === "trade" && Boolean(tradeContext?.product.allow_call));

  const showVideo =
    roomType === "direct" || (roomType === "trade" && Boolean(tradeContext?.product.allow_call) && tradeVideoCallEnabled);

  return (
    <div className="flex flex-col pb-[env(safe-area-inset-bottom,0px)]">
      <div className="border-b border-[color:var(--cm-room-divider)] px-3 py-3">
        <div className="flex items-center gap-3">
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-[color:var(--cm-room-primary-soft)] ring-1 ring-[color:var(--cm-room-divider)]">
            {otherUser.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={otherUser.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center sam-text-body-secondary font-semibold text-[color:var(--cm-room-primary)]">
                {otherUser.nickname.trim().slice(0, 1) || "?"}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-[color:var(--cm-room-text)]">{otherUser.nickname}</p>
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
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 max-w-[120px] flex-1 overflow-hidden rounded-full bg-black/10" aria-hidden>
                <div
                  className={`h-full rounded-full ${mannerFillClass(otherUser.mannerScore)}`}
                  style={{ width: `${Math.max(0, Math.min(100, otherUser.mannerScore))}%` }}
                />
              </div>
              <span
                className={`rounded px-1.5 py-0.5 sam-text-xxs font-semibold ${mannerAccentClass(
                  otherUser.mannerScore
                )}`}
              >
                {mannerTemperatureLabel(otherUser.mannerScore)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {roomType === "trade" && tradeContext ? (
        <div className="border-b border-[color:var(--cm-room-divider)] px-3 py-2.5">
          <MessengerTradeProductDockRow
            thumbnailUrl={tradeContext.product.thumbnailUrl}
            line1={messengerTradeDockLine1(tradeContext.product.title, undefined)}
            line2={formatMessengerTradeDockPriceLine(
              tradeContext.product.price,
              "PHP",
              PRODUCT_STATUS_LABEL[tradeContext.product.status]
            )}
            detailHref={`/post/${encodeURIComponent(tradeContext.product.id)}`}
            productLabel={tradeContext.product.title}
          />
        </div>
      ) : null}

      <nav className="flex flex-col" aria-label="채팅방 메뉴">
        <button type="button" onClick={onSearch} className={listRowClass(true)}>
          <Search className="h-[18px] w-[18px] shrink-0 text-[color:var(--cm-room-primary)]" strokeWidth={2} aria-hidden />
          <span className="min-w-0 flex-1 font-medium">대화 내 검색</span>
        </button>
        <button type="button" onClick={onOpenMediaFiles} className={listRowClass(true)}>
          <ImageIcon className="h-[18px] w-[18px] shrink-0 text-[color:var(--cm-room-primary)]" strokeWidth={2} aria-hidden />
          <span className="min-w-0 flex-1 font-medium">사진/파일 보기</span>
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
            <span className="min-w-0 flex-1 font-medium text-[color:var(--cm-room-text-muted)]">요청중</span>
          </div>
        ) : (
          <div className={listRowClass(false)}>
            <CheckCircle2 className="h-[18px] w-[18px] shrink-0 text-emerald-600" strokeWidth={2} aria-hidden />
            <span className="min-w-0 flex-1 font-medium text-[color:var(--cm-room-text)]">친구입니다</span>
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
            <span className="min-w-0 flex-1 font-medium">음성 통화</span>
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
            <span className="min-w-0 flex-1 font-medium">영상 통화</span>
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
            {isMuted ? "이 채팅방 알림 켜기" : "이 채팅방 알림 끄기"}
          </span>
        </button>
        <button
          type="button"
          onClick={onToggleArchive}
          disabled={disableArchiveToggle}
          className={`${listRowClass(!disableArchiveToggle)} disabled:opacity-40`}
        >
          <Archive className="h-[18px] w-[18px] shrink-0 text-[color:var(--cm-room-primary)]" strokeWidth={2} aria-hidden />
          <span className="min-w-0 flex-1 font-medium">{isArchived ? "보관 해제" : "채팅방 보관"}</span>
        </button>
        <button
          type="button"
          onClick={onLeaveRoom}
          disabled={disableLeaveRoom}
          className={`${listRowClass(!disableLeaveRoom)} border-b-0 text-red-600 disabled:opacity-40`}
        >
          <LogOut className="h-[18px] w-[18px] shrink-0" strokeWidth={2} aria-hidden />
          <span className="min-w-0 flex-1 font-medium">채팅방 나가기</span>
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
