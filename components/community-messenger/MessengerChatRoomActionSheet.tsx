"use client";

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
 * 채팅 목록 행 롱프레스 — 모바일 바텀시트만 (행 ⋯ 없음).
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
  onBlock,
  onLeave,
  onClearLocalPreview,
  onReportRoom,
}: Props) {
  const room = item.room;
  const rid = room.id;
  const isSettingsBusy = busyId === `room-settings:${rid}`;
  const isReadBusy = busyId === `room-read:${rid}`;
  const isArchiveBusy = busyId === `room-archive:${rid}`;
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

  return (
    <div className="fixed inset-0 z-[46] flex flex-col justify-end bg-black/30" role="dialog" aria-modal="true">
      <button type="button" className="min-h-0 flex-1 cursor-default" aria-label="닫기" onClick={onClose} />
      <div className="w-full max-h-[min(72vh,560px)] overflow-y-auto rounded-t-[12px] border border-ui-border bg-ui-surface pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="border-b border-ui-border px-3 py-2">
          <p className="truncate text-[15px] font-semibold text-ui-fg">{room.title}</p>
          <p className="mt-0.5 truncate text-[12px] text-ui-muted">{item.preview}</p>
          {archiveUi ? (
            <p className="mt-1 text-[11px] leading-snug text-ui-muted">보관함 · 길게 눌러 복원·알림·신고 등</p>
          ) : null}
        </div>
        <nav className="flex flex-col" aria-label="대화방 작업">
          {archiveUi ? (
            <>
              <SheetAction label="채팅방 열기" onClick={onEnterRoom} disabled={anyBusy} />
              <SheetAction
                label={archiveLabel}
                onClick={onToggleArchive}
                disabled={anyBusy || isArchiveBusy}
              />
              <SheetAction label="읽음 처리" onClick={onMarkRead} disabled={anyBusy || isReadBusy || room.unreadCount < 1} />
              <SheetAction
                label={room.isMuted ? "알림 켜기" : "알림 끄기"}
                onClick={onToggleMute}
                disabled={anyBusy || isSettingsBusy}
              />
              <SheetAction
                label={room.isPinned ? "고정 해제" : "상단 고정"}
                onClick={onTogglePin}
                disabled={anyBusy || isSettingsBusy}
              />
              {isPrivateGroup && onViewGroupInfo ? (
                <SheetAction label="그룹 정보" onClick={onViewGroupInfo} disabled={anyBusy} />
              ) : null}
              {isOpenGroup && onViewOpenChatInfo ? (
                <SheetAction label="오픈채팅 정보" onClick={onViewOpenChatInfo} disabled={anyBusy} />
              ) : null}
              {hasProductLink && onViewRelatedCommerce ? (
                <SheetAction label="관련 거래·주문 보기" onClick={onViewRelatedCommerce} disabled={anyBusy} />
              ) : null}
              {isDirect && onBlock ? <SheetAction label="차단" onClick={onBlock} disabled={anyBusy} danger /> : null}
              {isDirect && onViewFriendProfile ? (
                <SheetAction label="친구 프로필 보기" onClick={onViewFriendProfile} disabled={anyBusy} />
              ) : null}
              {onLeave ? (
                <SheetAction
                  label="채팅방 나가기"
                  sub={isLeaveBusy ? "처리 중…" : undefined}
                  onClick={onLeave}
                  disabled={anyBusy || isLeaveBusy}
                  danger
                />
              ) : null}
              {onClearLocalPreview ? (
                <SheetAction
                  label="로컬 기록 삭제"
                  sub="이 기기 미리보기만 삭제됩니다"
                  onClick={onClearLocalPreview}
                  disabled={anyBusy}
                />
              ) : null}
              {onReportRoom ? <SheetAction label="신고" onClick={onReportRoom} disabled={anyBusy} danger /> : null}
            </>
          ) : (
            <>
              <SheetAction label="채팅방 열기" onClick={onEnterRoom} disabled={anyBusy} />
              <SheetAction
                label={room.isPinned ? "고정 해제" : "상단 고정"}
                onClick={onTogglePin}
                disabled={anyBusy || isSettingsBusy}
              />
              <SheetAction
                label={room.isMuted ? "알림 켜기" : "알림 끄기"}
                onClick={onToggleMute}
                disabled={anyBusy || isSettingsBusy}
              />
              <SheetAction label="읽음 처리" onClick={onMarkRead} disabled={anyBusy || isReadBusy || room.unreadCount < 1} />
              <SheetAction
                label={defaultArchiveLabel}
                onClick={onToggleArchive}
                disabled={anyBusy || isArchiveBusy}
              />
              {isPrivateGroup && onViewGroupInfo ? (
                <SheetAction label="그룹 정보" onClick={onViewGroupInfo} disabled={anyBusy} />
              ) : null}
              {isOpenGroup && onViewOpenChatInfo ? (
                <SheetAction label="오픈채팅 정보" onClick={onViewOpenChatInfo} disabled={anyBusy} />
              ) : null}
              {hasProductLink && onViewRelatedCommerce ? (
                <SheetAction label="관련 거래·주문 보기" onClick={onViewRelatedCommerce} disabled={anyBusy} />
              ) : null}
              {isDirect && onBlock ? <SheetAction label="차단" onClick={onBlock} disabled={anyBusy} danger /> : null}
              {isDirect && onViewFriendProfile ? (
                <SheetAction label="친구 프로필 보기" onClick={onViewFriendProfile} disabled={anyBusy} />
              ) : null}
              {isPrivateGroup || isOpenGroup ? (
                onLeave ? (
                  <SheetAction
                    label="나가기"
                    sub={isLeaveBusy ? "처리 중…" : undefined}
                    onClick={onLeave}
                    disabled={anyBusy || isLeaveBusy}
                    danger
                  />
                ) : null
              ) : null}
              {onClearLocalPreview ? (
                <SheetAction label="로컬 기록 삭제" sub="이 기기 미리보기만 삭제됩니다" onClick={onClearLocalPreview} disabled={anyBusy} />
              ) : null}
              {onReportRoom ? <SheetAction label="신고" onClick={onReportRoom} disabled={anyBusy} danger /> : null}
            </>
          )}
        </nav>
        <button
          type="button"
          onClick={onClose}
          className="mt-0.5 w-full border-t border-ui-border py-2.5 text-[14px] font-medium text-ui-muted active:bg-ui-hover"
        >
          취소
        </button>
      </div>
    </div>
  );
}

function SheetAction({
  label,
  sub,
  onClick,
  disabled,
  danger = false,
}: {
  label: string;
  sub?: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-[44px] w-full flex-col items-start justify-center border-b border-ui-border px-4 py-2 text-left last:border-b-0 disabled:opacity-50 ${
        danger ? "text-[var(--ui-danger)]" : "text-ui-fg"
      } active:bg-ui-hover`}
    >
      <span className="text-[15px] font-medium">{label}</span>
      {sub ? <span className="text-[11px] text-ui-muted">{sub}</span> : null}
    </button>
  );
}
