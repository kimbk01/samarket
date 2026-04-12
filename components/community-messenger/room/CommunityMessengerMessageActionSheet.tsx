"use client";

import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

type Item = CommunityMessengerMessage & { pending?: boolean };

type Props = {
  item: Item;
  busy: string | null;
  roomUnavailable: boolean;
  onClose: () => void;
  onCopy: () => void;
  onDelete?: () => void;
  onForward: () => void;
  onReply: () => void;
  onReportMessage?: () => void;
  onReportUser?: () => void;
  onBlockUser?: () => void;
};

/**
 * 메시지 롱프레스 — 모바일 바텀시트 (데스크톱 컨텍스트 메뉴 금지).
 */
export function CommunityMessengerMessageActionSheet({
  item,
  busy,
  roomUnavailable,
  onClose,
  onCopy,
  onDelete,
  onForward,
  onReply,
  onReportMessage,
  onReportUser,
  onBlockUser,
}: Props) {
  const copyLabel =
    item.messageType === "image" ? "이미지 주소 복사" : item.messageType === "file" ? "파일 링크 복사" : "복사";

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/30" role="dialog" aria-modal="true">
      <button type="button" className="min-h-0 flex-1 cursor-default" aria-label="닫기" onClick={onClose} />
      <div className="w-full max-h-[min(72vh,480px)] overflow-y-auto rounded-t-[12px] border border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-header-bg)] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="border-b border-[color:var(--cm-room-divider)] px-3 py-2">
          <p className="truncate text-[13px] font-semibold text-[color:var(--cm-room-text)]">메시지</p>
          <p className="mt-0.5 line-clamp-2 text-[12px] text-[color:var(--cm-room-text-muted)]">
            {item.messageType === "text" ? item.content : `${item.messageType} · ${item.content?.slice(0, 80) ?? ""}`}
          </p>
        </div>
        <nav className="flex flex-col" aria-label="메시지 작업">
          <SheetRow label="답장" onClick={onReply} disabled={roomUnavailable} />
          <SheetRow label={copyLabel} onClick={onCopy} disabled={roomUnavailable} />
          <SheetRow label="전달" onClick={onForward} disabled={roomUnavailable} />
          {onDelete ? (
            <SheetRow
              label="삭제"
              onClick={onDelete}
              disabled={busy === "delete-message" || roomUnavailable}
              danger
            />
          ) : null}
          {!item.isMine && item.messageType !== "system" ? (
            <>
              {onReportMessage ? (
                <SheetRow label="메시지 신고" onClick={onReportMessage} disabled={roomUnavailable} danger />
              ) : null}
              {onReportUser && item.senderId ? (
                <SheetRow label="사용자 신고" onClick={onReportUser} disabled={roomUnavailable} danger />
              ) : null}
              {onBlockUser && item.senderId ? (
                <SheetRow label="차단" onClick={onBlockUser} disabled={busy === "block-peer" || roomUnavailable} danger />
              ) : null}
            </>
          ) : null}
        </nav>
        <button
          type="button"
          onClick={onClose}
          className="mt-0.5 w-full border-t border-[color:var(--cm-room-divider)] py-2.5 text-[14px] font-medium text-[color:var(--cm-room-text-muted)] active:bg-[color:var(--cm-room-primary-soft)]"
        >
          취소
        </button>
      </div>
    </div>
  );
}

function SheetRow({
  label,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-[44px] w-full flex-col items-start justify-center border-b border-[color:var(--cm-room-divider)] px-4 py-2.5 text-left text-[15px] font-medium last:border-b-0 disabled:opacity-45 ${
        danger ? "text-[var(--ui-danger)]" : "text-[color:var(--cm-room-text)]"
      } active:bg-[color:var(--cm-room-primary-soft)]`}
    >
      {label}
    </button>
  );
}
