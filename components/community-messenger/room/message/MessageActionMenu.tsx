"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

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
      className={`${danger ? OverlayUi.popoverItemDanger : OverlayUi.popoverItem} disabled:cursor-not-allowed ${
        nested ? "!pl-7 !text-[length:var(--overlay-body-2-size)]" : ""
      }`}
    >
      {label}
    </button>
  );
}

export type MessageActionMenuProps = {
  roomUnavailable: boolean;
  showCopy?: boolean;
  copyLabel: string;
  copyDisabled: boolean;
  copyTitle?: string;
  onCopy: () => void;
  edit?: { disabled: boolean; title?: string; onClick: () => void };
  replyDisabled: boolean;
  replyTitle?: string;
  onReply: () => void;
  /** 「전달하기」 — 다른 방으로 실제 전송(통합 공유 S6). 전달할 수 없는 메시지는 넘기지 않음 → 행 없음 */
  forward?: { onClick: () => void };
  shareExpanded: boolean;
  shareDisabled: boolean;
  shareTitle?: string;
  onToggleShare: () => void;
  /** toRoom·link 은 정책상 꺼지면(SH-P0-1·P0-2) 넘기지 않는다 → 행을 그리지 않음(회색 행·잘못된 안내 방지) */
  shareNested: {
    toRoom?: { label: string; disabled: boolean; title?: string; onClick: () => void };
    external: { disabled: boolean; title?: string; onClick: () => void };
    link?: { disabled: boolean; title?: string; onClick: () => void };
  } | null;
  deleteForMe?: { disabled: boolean; title?: string; onClick: () => void };
  deleteForEveryone?: { disabled: boolean; title?: string; onClick: () => void };
  deleteVoiceHard?: { onClick: () => void };
  pin?: { label: string; disabled: boolean; title?: string; onClick: () => void };
  /** 사진 저장(개별·모두) — 기기 로컬 동작이라 roomUnavailable 과 무관 */
  photoSaveRows?: Array<{ key: string; label: string; disabled?: boolean; onClick: () => void }>;
  /** 상대 메시지 신고·보낸 사람 차단 — 방을 쓸 수 없어도 신고·차단은 가능해야 한다 */
  reportMessage?: { onClick: () => void };
  blockSender?: { onClick: () => void };
};

export function MessageActionMenu(props: MessageActionMenuProps) {
  const { t } = useI18n();
  const {
    roomUnavailable,
    showCopy = true,
    copyLabel,
    copyDisabled,
    copyTitle,
    onCopy,
    edit,
    replyDisabled,
    replyTitle,
    onReply,
    forward,
    shareExpanded,
    shareDisabled,
    shareTitle,
    onToggleShare,
    shareNested,
    deleteForMe,
    deleteForEveryone,
    deleteVoiceHard,
    pin,
    photoSaveRows,
    reportMessage,
    blockSender,
  } = props;

  const hasDeleteRows = Boolean(deleteForMe || deleteForEveryone || deleteVoiceHard);

  return (
    <nav className="flex flex-col bg-[color:var(--overlay-surface)]" aria-label={t("cm_ui_message_actions")}>
      {showCopy ? (
        <MenuRow
          label={copyLabel}
          onClick={onCopy}
          disabled={roomUnavailable || copyDisabled}
          title={copyTitle}
        />
      ) : null}
      {edit ? (
        <MenuRow
          label={t("common_edit")}
          onClick={edit.onClick}
          disabled={roomUnavailable || edit.disabled}
          title={edit.title}
        />
      ) : null}
      <MenuRow
        label={t("cm_ui_reply")}
        onClick={onReply}
        disabled={roomUnavailable || replyDisabled}
        title={replyTitle}
      />
      {forward ? (
        <MenuRow label={t("share_forward_cta")} onClick={forward.onClick} disabled={roomUnavailable} />
      ) : null}
      {photoSaveRows?.map((row) => (
        <MenuRow key={row.key} label={row.label} onClick={row.onClick} disabled={Boolean(row.disabled)} />
      ))}
      {pin ? (
        <MenuRow
          label={pin.label}
          onClick={pin.onClick}
          disabled={roomUnavailable || pin.disabled}
          title={pin.title}
        />
      ) : null}
      <div className="border-t border-[color:var(--overlay-border)]">
        <MenuRow
          label={t("common_share")}
          onClick={onToggleShare}
          disabled={roomUnavailable || shareDisabled}
          title={shareTitle}
        />
        {shareExpanded && shareNested ? (
          <div className="border-t border-[color:var(--overlay-border)] bg-[color:var(--overlay-secondary)] pb-1">
            {shareNested.toRoom ? (
              <MenuRow
                label={shareNested.toRoom.label}
                onClick={shareNested.toRoom.onClick}
                disabled={shareNested.toRoom.disabled}
                title={shareNested.toRoom.title}
                nested
              />
            ) : null}
            <MenuRow
              label={t("cm_ui_share_externally")}
              onClick={shareNested.external.onClick}
              disabled={shareNested.external.disabled}
              title={shareNested.external.title}
              nested
            />
            {shareNested.link ? (
              <MenuRow
                label={t("cm_ui_copy_link")}
                onClick={shareNested.link.onClick}
                disabled={shareNested.link.disabled}
                title={shareNested.link.title}
                nested
              />
            ) : null}
          </div>
        ) : null}
      </div>
      {reportMessage || blockSender ? (
        <div className="border-t border-[color:var(--overlay-border)]">
          {reportMessage ? <MenuRow label={t("common_report")} onClick={reportMessage.onClick} /> : null}
          {blockSender ? <MenuRow label={t("common_block")} onClick={blockSender.onClick} danger /> : null}
        </div>
      ) : null}
      {hasDeleteRows ? (
        <div className="border-t border-[color:var(--overlay-border)]">
          {deleteForMe ? (
            <MenuRow
              label={t("cm_ui_delete_for_me_only")}
              onClick={deleteForMe.onClick}
              disabled={roomUnavailable || deleteForMe.disabled}
              title={deleteForMe.title}
              danger
            />
          ) : null}
          {deleteForEveryone ? (
            <MenuRow
              label={t("cm_ui_delete_for_everyone")}
              onClick={deleteForEveryone.onClick}
              disabled={roomUnavailable || deleteForEveryone.disabled}
              title={deleteForEveryone.title}
              danger
            />
          ) : null}
          {deleteVoiceHard ? (
            <MenuRow
              label={t("cm_ui_permanently_delete_voice_message")}
              onClick={deleteVoiceHard.onClick}
              danger
            />
          ) : null}
        </div>
      ) : null}
    </nav>
  );
}
