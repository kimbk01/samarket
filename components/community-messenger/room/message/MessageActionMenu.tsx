"use client";

function MenuRow({
  label,
  onClick,
  disabled,
  danger,
  title,
  nested,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  title?: string;
  nested?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-[44px] w-full flex-col items-start justify-center border-b border-neutral-200 px-4 py-2.5 text-left sam-text-body font-medium text-neutral-900 last:border-b-0 disabled:opacity-45 dark:border-neutral-700 dark:text-neutral-100 ${
        nested ? "pl-7 sam-text-helper" : ""
      } ${danger ? "text-red-600 dark:text-red-400" : ""} active:bg-neutral-100 dark:active:bg-neutral-900`}
    >
      {label}
    </button>
  );
}

export type MessageActionMenuProps = {
  roomUnavailable: boolean;
  copyLabel: string;
  copyDisabled: boolean;
  copyTitle?: string;
  onCopy: () => void;
  replyDisabled: boolean;
  replyTitle?: string;
  onReply: () => void;
  shareExpanded: boolean;
  shareDisabled: boolean;
  shareTitle?: string;
  onToggleShare: () => void;
  shareNested: {
    toRoom: { label: string; disabled: boolean; title?: string; onClick: () => void };
    external: { disabled: boolean; title?: string; onClick: () => void };
    link: { disabled: boolean; title?: string; onClick: () => void };
  } | null;
  deleteExpanded: boolean;
  onToggleDelete: () => void;
  /** 삭제 서브메뉴만 닫기(취소) */
  onCancelDeleteNested: () => void;
  deleteForMe?: { disabled: boolean; title?: string; onClick: () => void };
  deleteForEveryone?: { disabled: boolean; title?: string; onClick: () => void };
  deleteVoiceHard?: { onClick: () => void };
};

export function MessageActionMenu(props: MessageActionMenuProps) {
  const {
    roomUnavailable,
    copyLabel,
    copyDisabled,
    copyTitle,
    onCopy,
    replyDisabled,
    replyTitle,
    onReply,
    shareExpanded,
    shareDisabled,
    shareTitle,
    onToggleShare,
    shareNested,
    deleteExpanded,
    onToggleDelete,
    onCancelDeleteNested,
    deleteForMe,
    deleteForEveryone,
    deleteVoiceHard,
  } = props;

  const hasDeleteSection = Boolean(deleteForMe || deleteForEveryone || deleteVoiceHard);
  const deleteNestedOpen = deleteExpanded && hasDeleteSection;

  return (
    <nav className="flex flex-col bg-white dark:bg-neutral-950" aria-label="메시지 작업">
      <MenuRow
        label={copyLabel}
        onClick={onCopy}
        disabled={roomUnavailable || copyDisabled}
        title={copyTitle}
      />
      <MenuRow
        label="답장"
        onClick={onReply}
        disabled={roomUnavailable || replyDisabled}
        title={replyTitle}
      />
      <div className="border-b border-neutral-200 dark:border-neutral-700">
        <MenuRow
          label="공유"
          onClick={onToggleShare}
          disabled={roomUnavailable || shareDisabled}
          title={shareTitle}
        />
        {shareExpanded && shareNested ? (
          <div className="border-t border-neutral-100 bg-neutral-50 pb-1 dark:border-neutral-800 dark:bg-neutral-900">
            <MenuRow
              label={shareNested.toRoom.label}
              onClick={shareNested.toRoom.onClick}
              disabled={shareNested.toRoom.disabled}
              title={shareNested.toRoom.title}
              nested
            />
            <MenuRow
              label="외부로 공유"
              onClick={shareNested.external.onClick}
              disabled={shareNested.external.disabled}
              title={shareNested.external.title}
              nested
            />
            <MenuRow
              label="링크 복사"
              onClick={shareNested.link.onClick}
              disabled={shareNested.link.disabled}
              title={shareNested.link.title}
              nested
            />
          </div>
        ) : null}
      </div>
      {hasDeleteSection ? (
        <div className="border-b border-neutral-200 dark:border-neutral-700">
          <MenuRow
            label="삭제"
            onClick={onToggleDelete}
            disabled={roomUnavailable}
            title="나에게만 숨기기 또는 모두에게서 삭제"
            danger
          />
          {deleteNestedOpen ? (
            <div className="border-t border-neutral-100 bg-neutral-50 pb-1 dark:border-neutral-800 dark:bg-neutral-900">
              {deleteForMe ? (
                <MenuRow
                  label="나에게서만 삭제"
                  onClick={() => {
                    onCancelDeleteNested();
                    deleteForMe.onClick();
                  }}
                  disabled={roomUnavailable || deleteForMe.disabled}
                  title={deleteForMe.title}
                  nested
                  danger
                />
              ) : null}
              {deleteForEveryone ? (
                <MenuRow
                  label="모두에게서 삭제"
                  onClick={() => {
                    onCancelDeleteNested();
                    deleteForEveryone.onClick();
                  }}
                  disabled={roomUnavailable || deleteForEveryone.disabled}
                  title={deleteForEveryone.title}
                  nested
                  danger
                />
              ) : null}
              {deleteVoiceHard ? (
                <MenuRow
                  label="음성 메시지 영구 삭제"
                  onClick={() => {
                    onCancelDeleteNested();
                    deleteVoiceHard.onClick();
                  }}
                  nested
                  danger
                />
              ) : null}
              <MenuRow label="취소" onClick={onCancelDeleteNested} nested />
            </div>
          ) : null}
        </div>
      ) : null}
    </nav>
  );
}
