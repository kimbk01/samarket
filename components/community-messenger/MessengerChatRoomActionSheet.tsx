"use client";

import type { ReactNode } from "react";
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
  /** 없으면 「위에 고정」 항목을 뺀다 (주문 채팅 고객 목록) */
  onTogglePin?: () => void;
  onToggleMute: () => void;
  onMarkRead: () => void;
  /** 없으면 「보관」 항목을 뺀다 (주문 채팅 고객 목록) */
  onToggleArchive?: () => void;
  onViewFriendProfile?: () => void;
  onViewGroupInfo?: () => void;
  onViewOpenChatInfo?: () => void;
  onViewRelatedCommerce?: () => void;
  onBlock?: () => void;
  onLeave?: () => void;
  onClearLocalPreview?: () => void;
  onReportRoom?: () => void;
  /**
   * 거래·주문 채팅 목록(채팅 시안 4판 「10-2」) — 줄 54 · 아이콘 칸 42 · 글자 16/600 (`data-cm-pillar-sheet`).
   * 대화 목록 시트는 `default` 그대로.
   */
  pillar?: "trade" | "delivery" | null;
  /** 주문 행 머리: 매장 사진 44 · 매장 이름 17/700 · 회색 「{상태} · {날짜}」 — 있으면 제목+X 머리 대신 */
  pillarHeader?: { avatar: ReactNode; title: string; subtitle: string } | null;
  /** 주문 행 「주문 내역 보기」 — 고객 주문 상세로 이동 */
  onViewOrderDetail?: () => void;
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
  pillar = null,
  pillarHeader = null,
  onViewOrderDetail,
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
        label: t("cm_ui_room_action_view_profile"),
        icon: <ProfileIcon />,
        onClick: onViewFriendProfile,
        disabled: anyBusy,
      }
    : hasProductLink && onViewRelatedCommerce
      ? {
          label: communityMessengerRoomIsDelivery(room)
            ? t("cm_ui_room_action_view_order")
            : t("cm_ui_room_action_view_trade"),
          icon: <CommerceIcon />,
          onClick: onViewRelatedCommerce,
          disabled: anyBusy,
        }
      : isPrivateGroup && onViewGroupInfo
        ? {
            label: t("cm_ui_room_action_group_info"),
            icon: <InfoIcon />,
            onClick: onViewGroupInfo,
            disabled: anyBusy,
          }
        : isOpenGroup && onViewOpenChatInfo
          ? {
              label: t("cm_ui_room_action_meeting_info"),
              icon: <InfoIcon />,
              onClick: onViewOpenChatInfo,
              disabled: anyBusy,
            }
          : null;

  const mainItems: DibayMenuItem[] = [
    { key: "enter", icon: <EnterIcon />, label: t("cm_ui_open_chat_room"), onClick: onEnterRoom, disabled: anyBusy },
    ...(contextualAction ? [{ key: "context", ...contextualAction }] : []),
    ...(onViewOrderDetail
      ? [
          {
            key: "order-detail",
            icon: <CommerceIcon />,
            label: t("cm_ui_room_action_view_order_history"),
            onClick: onViewOrderDetail,
            disabled: anyBusy,
          },
        ]
      : []),
  ];
  const settingItems: DibayMenuItem[] = [
    {
      key: "mute",
      icon: <MuteIcon />,
      label: room.isMuted ? t("cm_ui_turn_on_notifications") : t("cm_ui_turn_off_notifications"),
      onClick: onToggleMute,
      disabled: anyBusy || isSettingsBusy,
    },
    ...(onTogglePin
      ? [
          {
            key: "pin",
            icon: <PinIcon />,
            label: room.isPinned ? t("cm_ui_unpin_top") : t("cm_ui_pin_chat_room_top"),
            onClick: onTogglePin,
            disabled: anyBusy || isSettingsBusy,
          },
        ]
      : []),
    {
      key: "read",
      icon: <ReadIcon />,
      label: t("cm_ui_mark_as_read"),
      onClick: onMarkRead,
      disabled: anyBusy || isReadBusy || room.unreadCount <= 0,
    },
    ...(onToggleArchive
      ? [
          {
            key: "archive",
            icon: <ArchiveIcon />,
            label: archiveUi ? archiveLabel : defaultArchiveLabel,
            onClick: onToggleArchive,
            disabled: anyBusy || isArchiveBusy,
          },
        ]
      : []),
  ];
  const dangerItems: DibayMenuItem[] = onLeave
    ? [{ key: "leave", icon: <LeaveIcon />, label: t("cm_ui_leave"), onClick: onLeave, disabled: anyBusy || isLeaveBusy, danger: true }]
    : [];

  /**
   * 주문 행(채팅 시안 4판 10-2): 채팅방 열기 · 주문 내역 보기 · 알림 · 읽음 처리 한 묶음 → 간격 띠 → 빨간 나가기.
   * 그 외(대화·거래 행): 기존 묶음 그대로.
   */
  const groups: DibayMenuItem[][] =
    pillar === "delivery" ? [[...mainItems, ...settingItems], dangerItems] : [mainItems, settingItems, dangerItems];

  /**
   * U-6 (1단계 문서 §13-2 S3): 셀 옆 드롭다운 대신 프로필 시트와 같은 하단 행동 메뉴 —
   * 머리(방 이름 + X) · 아이콘 왼쪽 · 묶음 간격 · 「나가기」는 마지막 묶음 빨간색.
   */
  return (
    <DibayBottomSheet open onClose={onClose} ariaLabel={t("cm_ui_chat_room_actions")}>
      <div data-messenger-chat-sheet="true" data-cm-pillar-sheet={pillar ?? undefined}>
        {pillarHeader ? (
          <div
            className="-mx-4 flex items-center gap-3 border-b px-5 pb-3 pt-0.5"
            style={{ borderColor: "var(--overlay-border)" }}
            data-cm-pillar-sheet-header=""
          >
            <div className="shrink-0">{pillarHeader.avatar}</div>
            <div className="min-w-0">
              <p className="truncate text-[17px] font-bold leading-[1.3]" style={{ color: "var(--cm-chat-fg)" }}>
                {pillarHeader.title}
              </p>
              {pillarHeader.subtitle ? (
                <p className="truncate text-[12.5px] leading-[1.35]" style={{ color: "var(--cm-chat-sub)" }}>
                  {pillarHeader.subtitle}
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <DibaySheetHeader title={room.title} onClose={onClose} closeLabel={t("nav_close")} />
        )}
        <DibayMenuList groups={groups} />
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
