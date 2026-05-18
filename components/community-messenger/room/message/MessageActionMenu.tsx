"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";

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
  const { t } = useI18n();
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
    <nav className="flex flex-col bg-white dark:bg-neutral-950" aria-label={t("cm_ui_message_actions")}>
      <MenuRow
        label={copyLabel}
        onClick={onCopy}
        disabled={roomUnavailable || copyDisabled}
        title={copyTitle}
      />
      <MenuRow
        label={t("cm_ui_reply")}
        onClick={onReply}
        disabled={roomUnavailable || replyDisabled}
        title={replyTitle}
      />
      <div className="border-b border-neutral-200 dark:border-neutral-700">
        <MenuRow
          label={t("common_share")}
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
              label={t("cm_ui_share_externally")}
              onClick={shareNested.external.onClick}
              disabled={shareNested.external.disabled}
              title={shareNested.external.title}
              nested
            />
            <MenuRow
              label={t("cm_ui_copy_link")}
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
            label={t("common_delete")}
            onClick={onToggleDelete}
            disabled={roomUnavailable}
            title={t("cm_ui_hide_for_me_or_delete_for_everyone")}
            danger
          />
          {deleteNestedOpen ? (
            <div className="border-t border-neutral-100 bg-neutral-50 pb-1 dark:border-neutral-800 dark:bg-neutral-900">
              {deleteForMe ? (
                <MenuRow
                  label={t("cm_ui_delete_for_me_only")}
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
                  label={t("cm_ui_delete_for_everyone")}
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
                  label={t("cm_ui_permanently_delete_voice_message")}
                  onClick={() => {
                    onCancelDeleteNested();
                    deleteVoiceHard.onClick();
                  }}
                  nested
                  danger
                />
              ) : null}
              <MenuRow label={t("common_cancel")} onClick={onCancelDeleteNested} nested />
            </div>
          ) : null}
        </div>
      ) : null}
    </nav>
  );
}
