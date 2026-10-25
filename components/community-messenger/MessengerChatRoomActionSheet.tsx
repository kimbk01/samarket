"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessengerMenuAnchorRect } from "@/components/community-messenger/MessengerChatListItem";
import type { MessengerChatListContext } from "@/lib/community-messenger/messenger-ia";
import {
  communityMessengerRoomIsDelivery,
  communityMessengerRoomIsTrade,
} from "@/lib/community-messenger/messenger-room-domain";
import { DibayBottomSheet, DibayMenuList, DibaySheetHeader, type DibayMenuItem } from "@/components/ui/dibay-overlay";
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
 * 채팅 목록 행 롱프레스 — S3 하단 행동 메뉴. `anchorRect` 는 호출부 호환용(위치 계산에 쓰지 않음).
 */
export function MessengerChatRoomActionSheet({
  item,
  listContext = "default",
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
  const { t } = useI18n();
  const room = item.room;
  const rid = room.id;
  const isSettingsBusy = busyId === `settings:${rid}`;
  const isArchiveBusy = busyId === `archive:${rid}`;
  const isReadBusy = busyId === `read:${rid}`;
  const isLeaveBusy = busyId === `leave:${rid}`;
  const hidden = communityMessengerRoomIsInboxHidden(room);
  const anyBusy = Boolean(busyId);
  const archiveUi = listContext === "archive";

  const archiveLabel = hidden ? t("cm_ui_restore_show_in_list") : t("cm_ui_archive");
  const defaultArchiveLabel = hidden ? t("cm_ui_unarchive") : t("cm_ui_archive");

  const isDirect = room.roomType === "direct";
  const isPrivateGroup = room.roomType === "private_group";
  const isOpenGroup = room.roomType === "open_group";
  const commerceMeta = room.contextMeta;
  const hasProductLink =
    Boolean(commerceMeta?.productChatId?.trim()) && (communityMessengerRoomIsTrade(room) || communityMessengerRoomIsDelivery(room));

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
              label: "모임 정보",
              icon: <InfoIcon />,
              onClick: onViewOpenChatInfo,
              disabled: anyBusy,
            }
          : null;

  const mainItems: DibayMenuItem[] = [
    { key: "enter", icon: <EnterIcon />, label: t("cm_ui_open_chat_room"), onClick: onEnterRoom, disabled: anyBusy },
    ...(contextualAction ? [{ key: "context", ...contextualAction }] : []),
  ];
  const settingItems: DibayMenuItem[] = [
    {
      key: "mute",
      icon: <MuteIcon />,
      label: room.isMuted ? t("cm_ui_turn_on_notifications") : t("cm_ui_turn_off_notifications"),
      onClick: onToggleMute,
      disabled: anyBusy || isSettingsBusy,
    },
    {
      key: "pin",
      icon: <PinIcon />,
      label: room.isPinned ? t("cm_ui_unpin_top") : t("cm_ui_pin_chat_room_top"),
      onClick: onTogglePin,
      disabled: anyBusy || isSettingsBusy,
    },
    {
      key: "read",
      icon: <ReadIcon />,
      label: t("cm_ui_mark_as_read"),
      onClick: onMarkRead,
      disabled: anyBusy || isReadBusy || room.unreadCount <= 0,
    },
    {
      key: "archive",
      icon: <ArchiveIcon />,
      label: archiveUi ? archiveLabel : defaultArchiveLabel,
      onClick: onToggleArchive,
      disabled: anyBusy || isArchiveBusy,
    },
  ];
  const dangerItems: DibayMenuItem[] = onLeave
    ? [{ key: "leave", icon: <LeaveIcon />, label: t("cm_ui_leave"), onClick: onLeave, disabled: anyBusy || isLeaveBusy, danger: true }]
    : [];

  /**
   * U-6 (1단계 문서 §13-2 S3): 셀 옆 드롭다운 대신 프로필 시트와 같은 하단 행동 메뉴 —
   * 머리(방 이름 + X) · 아이콘 왼쪽 · 묶음 간격 · 「나가기」는 마지막 묶음 빨간색.
   */
  return (
    <DibayBottomSheet open onClose={onClose} ariaLabel={t("cm_ui_chat_room_actions")}>
      <div data-messenger-chat-sheet="true">
        <DibaySheetHeader title={room.title} onClose={onClose} closeLabel={t("nav_close")} />
        <DibayMenuList groups={[mainItems, settingItems, dangerItems]} />
      </div>
    </DibayBottomSheet>
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
