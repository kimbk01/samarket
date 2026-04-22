"use client";

import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { MessengerMenuAnchorRect } from "@/components/community-messenger/MessengerChatListItem";
import type { MessengerChatListContext } from "@/lib/community-messenger/messenger-ia";
import {
  communityMessengerRoomIsDelivery,
  communityMessengerRoomIsTrade,
} from "@/lib/community-messenger/messenger-room-domain";
import { communityMessengerRoomIsInboxHidden } from "@/lib/community-messenger/types";
import type { UnifiedRoomListItem } from "@/lib/community-messenger/use-community-messenger-home-state";

type Props = {
  item: UnifiedRoomListItem;
  listContext?: MessengerChatListContext;
  anchorRect: MessengerMenuAnchorRect | null;
  busyId: string | null;
  onClose: () => void;
  /** 목록 롱프레스 시트 최상단 — 방으로 진입 */
  onEnterRoom: () => void;
  onTogglePin: () => void;
  onToggleMute: () => void;
  onMarkRead: () => void;
  onToggleArchive: () => void;
  onViewFriendProfile?: () => void;
  onViewGroupInfo?: () => void;
  onViewOpenChatInfo?: () => void;
  onViewRelatedCommerce?: () => void;
  onBlock?: () => void;
  onLeave?: () => void;
  onClearLocalPreview?: () => void;
  onReportRoom?: () => void;
};

/**
 * 채팅 목록 행 롱프레스 — 셀 근처 anchored menu.
 */
export function MessengerChatRoomActionSheet({
  item,
  listContext = "default",
  anchorRect,
  busyId,
  onClose,
  onEnterRoom,
  onTogglePin,
  onToggleMute,
  onMarkRead,
  onToggleArchive,
  onViewFriendProfile,
  onViewGroupInfo,
  onViewOpenChatInfo,
  onViewRelatedCommerce,
  onLeave,
}: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [panelHeight, setPanelHeight] = useState(0);
  const room = item.room;
  const rid = room.id;
  const isSettingsBusy = busyId === `room-settings:${rid}`;
  const isArchiveBusy = busyId === `room-archive:${rid}`;
  const isReadBusy = busyId === `room-read:${rid}`;
  const isLeaveBusy = busyId === `room-leave:${rid}`;
  const hidden = communityMessengerRoomIsInboxHidden(room);
  const anyBusy = Boolean(busyId);
  const archiveUi = listContext === "archive";

  const archiveLabel = hidden ? "복원 · 목록에 다시 표시" : "보관";
  const defaultArchiveLabel = hidden ? "보관 해제" : "보관";

  const isDirect = room.roomType === "direct";
  const isPrivateGroup = room.roomType === "private_group";
  const isOpenGroup = room.roomType === "open_group";
  const commerceMeta = room.contextMeta;
  const hasProductLink =
    Boolean(commerceMeta?.productChatId?.trim()) && (communityMessengerRoomIsTrade(room) || communityMessengerRoomIsDelivery(room));

  useLayoutEffect(() => {
    const next = panelRef.current?.getBoundingClientRect().height ?? 0;
    if (next !== panelHeight) setPanelHeight(next);
  }, [archiveUi, hasProductLink, isOpenGroup, isPrivateGroup, panelHeight, room.isMuted, room.isPinned]);

  const anchoredStyle = useMemo(() => {
    const viewportWidth = typeof window === "undefined" ? 390 : window.innerWidth;
    const viewportHeight = typeof window === "undefined" ? 844 : window.innerHeight;
    const menuWidth = Math.min(272, viewportWidth - 24);
    const spacing = 8;
    const fallbackLeft = Math.max(12, viewportWidth - menuWidth - 12);
    const anchor = anchorRect ?? {
      top: viewportHeight / 2 - 24,
      bottom: viewportHeight / 2 + 24,
      left: fallbackLeft,
      right: fallbackLeft + menuWidth,
      width: menuWidth,
      height: 48,
    };
    const preferredTop = anchor.bottom + spacing;
    const nextTop =
      panelHeight > 0 && preferredTop + panelHeight > viewportHeight - 12
        ? Math.max(12, anchor.top - panelHeight - spacing)
        : preferredTop;
    const left = Math.min(
      Math.max(12, anchor.left + Math.min(12, Math.max(0, anchor.width - menuWidth))),
      viewportWidth - menuWidth - 12
    );

    return {
      top: `${Math.round(nextTop)}px`,
      left: `${Math.round(left)}px`,
      width: `${Math.round(menuWidth)}px`,
    };
  }, [anchorRect, panelHeight]);

  const contextualAction = isDirect && onViewFriendProfile
    ? {
        label: "프로필 보기",
        icon: <ProfileIcon />,
        onClick: onViewFriendProfile,
        disabled: anyBusy,
      }
    : hasProductLink && onViewRelatedCommerce
      ? {
          label: communityMessengerRoomIsDelivery(room) ? "관련 주문 보기" : "관련 거래 보기",
          icon: <CommerceIcon />,
          onClick: onViewRelatedCommerce,
          disabled: anyBusy,
        }
      : isPrivateGroup && onViewGroupInfo
        ? {
            label: "그룹 정보",
            icon: <InfoIcon />,
            onClick: onViewGroupInfo,
            disabled: anyBusy,
          }
        : isOpenGroup && onViewOpenChatInfo
          ? {
              label: "오픈채팅 정보",
              icon: <InfoIcon />,
              onClick: onViewOpenChatInfo,
              disabled: anyBusy,
            }
          : null;

  return (
    <div
      data-messenger-chat-sheet="true"
      className="fixed inset-0 z-[46]"
      role="dialog"
      aria-modal="true"
    >
      <button type="button" className="absolute inset-0 cursor-default bg-transparent" aria-label="닫기" onClick={onClose} />
      <div
        ref={panelRef}
        className="absolute overflow-hidden rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] shadow-[var(--messenger-shadow-soft)]"
        style={anchoredStyle}
      >
        <nav className="flex flex-col" aria-label="대화방 작업">
          <AnchoredAction
            label="채팅방 열기"
            icon={<EnterIcon />}
            onClick={onEnterRoom}
            disabled={anyBusy}
          />
          <AnchoredAction
            label={room.isMuted ? "알림 켜기" : "알림 끄기"}
            icon={<MuteIcon />}
            onClick={onToggleMute}
            disabled={anyBusy || isSettingsBusy}
          />
          <AnchoredAction
            label={room.isPinned ? "상단 고정 해제" : "채팅방 상단 고정"}
            icon={<PinIcon />}
            onClick={onTogglePin}
            disabled={anyBusy || isSettingsBusy}
          />
          <AnchoredAction
            label="읽음 처리"
            icon={<ReadIcon />}
            onClick={onMarkRead}
            disabled={anyBusy || isReadBusy || room.unreadCount <= 0}
          />
          <AnchoredAction
            label={archiveUi ? archiveLabel : defaultArchiveLabel}
            icon={<ArchiveIcon />}
            onClick={onToggleArchive}
            disabled={anyBusy || isArchiveBusy}
          />
          {contextualAction ? (
            <AnchoredAction
              label={contextualAction.label}
              icon={contextualAction.icon}
              onClick={contextualAction.onClick}
              disabled={contextualAction.disabled}
            />
          ) : null}
          {onLeave ? (
            <AnchoredAction
              label="나가기"
              icon={<LeaveIcon />}
              onClick={onLeave}
              disabled={anyBusy || isLeaveBusy}
            />
          ) : null}
        </nav>
      </div>
    </div>
  );
}

function AnchoredAction({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-[44px] w-full items-center justify-between gap-3 border-b border-[color:var(--messenger-divider)] px-3 py-2 text-left sam-text-body font-semibold last:border-b-0 disabled:opacity-40 active:bg-[color:var(--messenger-primary-soft)]"
      style={{ color: "var(--messenger-text)" }}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="shrink-0" style={{ color: "var(--messenger-text-secondary)" }}>
        {icon}
      </span>
    </button>
  );
}

function EnterIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 6h7a3 3 0 013 3v6a3 3 0 01-3 3H8" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 8l4 4-4 4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 12H4" />
    </svg>
  );
}

function MuteIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 9v6h4l5 4V5l-5 4H5z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 8l5 8" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 8l-5 8" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 4l6 6-3 1-3 6-2-2-4 5-1-1 5-4-2-2 6-3 1-3z" />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 7l1 11a2 2 0 002 2h6a2 2 0 002-2l1-11" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 11h6" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 12a4 4 0 100-8 4 4 0 000 8z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 20a7 7 0 0114 0" />
    </svg>
  );
}

function CommerceIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16l-1.2 7.1a2 2 0 01-2 1.7H8.2a2 2 0 01-2-1.7L5 5H3" />
      <circle cx="9" cy="19" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="17" cy="19" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7h.01" />
    </svg>
  );
}

function ReadIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16v10H4z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12l2.5 2.5L16 9" />
    </svg>
  );
}

function LeaveIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H7a2 2 0 00-2 2v8a2 2 0 002 2h3" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 8l4 4-4 4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 12H9" />
    </svg>
  );
}
