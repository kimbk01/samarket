"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayConfirmDialog, DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { Sam } from "@/lib/ui/sam-component-classes";
import type { MessengerPeerSocialCta } from "@/lib/community-messenger/messenger-friend-add-cta";

/** 진행 중인 친구 행동 — 해당 버튼만 로딩 표시, 나머지는 비활성 */
export type MessengerFriendCtaBusy = "send" | "cancel" | "accept" | "reject" | null;

type Props = {
  cta: MessengerPeerSocialCta;
  /** row: 검색 결과 행 오른쪽 작은 버튼 · sheet: 프로필 시트 전체 폭 버튼 */
  layout: "row" | "sheet";
  busy: MessengerFriendCtaBusy;
  /** 다른 행동 진행 중 — 버튼만 비활성 */
  disabled?: boolean;
  peerLabel: string;
  onSend?: () => void;
  onCancel?: () => void;
  onAccept?: () => void;
  onReject?: () => void;
  /** 친구일 때 row 의 「메시지」 */
  onMessage?: () => void;
};

const ROW_BTN = `${Sam.btn.sm} ${Sam.btn.disabledToken} shrink-0 !min-h-[36px] !px-3`;

function Spinner() {
  return <span className="dibay-overlay-btn__spinner" aria-hidden />;
}

/**
 * 친구 관계 CTA — 1단계 문서 §3-1 상태표 단일 구현.
 * none → 친구 요청 · pending_outgoing → 요청됨 + 요청 취소(확인) · pending_incoming → 거절·수락 · friend → 메시지(row).
 */
export function MessengerFriendRelationCta({
  cta,
  layout,
  busy,
  disabled = false,
  peerLabel,
  onSend,
  onCancel,
  onAccept,
  onReject,
  onMessage,
}: Props) {
  const { t } = useI18n();
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const locked = disabled || busy !== null;

  const cancelConfirm = (
    <DibayConfirmDialog
      open={cancelConfirmOpen}
      title={t("cm_friend_cancel_confirm_title")}
      description={t("cm_friend_cancel_confirm_body", { name: peerLabel })}
      cancelLabel={t("cm_friend_cancel_confirm_keep")}
      confirmLabel={t("cm_friend_cta_cancel")}
      confirmTone="destructive"
      onCancel={() => setCancelConfirmOpen(false)}
      onConfirm={() => {
        setCancelConfirmOpen(false);
        onCancel?.();
      }}
    />
  );

  if (cta.kind === "blocked") {
    if (layout === "row") return null;
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-3 text-center">
        <p className="sam-text-body font-semibold text-sam-muted">{t("cm_friend_cta_unavailable")}</p>
        <p className="mt-1 sam-text-helper leading-snug text-sam-muted">{t("cm_ui_cannot_add_friend_or_chat_when_blocked")}</p>
      </div>
    );
  }

  if (layout === "row") {
    if (cta.kind === "friend") {
      return onMessage ? (
        <button type="button" className={`${Sam.btn.secondaryCombo} ${ROW_BTN}`} disabled={locked} onClick={onMessage}>
          {t("cm_friend_cta_message_short")}
        </button>
      ) : null;
    }
    if (cta.kind === "add_friend") {
      return (
        <button
          type="button"
          className={`${Sam.btn.primaryCombo} ${ROW_BTN}`}
          disabled={locked || !onSend}
          aria-busy={busy === "send" || undefined}
          onClick={onSend}
        >
          {busy === "send" ? <Spinner /> : t("cm_friend_cta_request_short")}
        </button>
      );
    }
    if (cta.kind === "pending_outgoing") {
      return (
        <>
          <button
            type="button"
            className={`${Sam.btn.secondaryCombo} ${ROW_BTN}`}
            disabled={locked || !onCancel}
            aria-busy={busy === "cancel" || undefined}
            onClick={() => setCancelConfirmOpen(true)}
          >
            {busy === "cancel" ? <Spinner /> : t("cm_friend_cta_cancel")}
          </button>
          {cancelConfirm}
        </>
      );
    }
    return (
      <span className="flex shrink-0 gap-1.5">
        <button
          type="button"
          className={`${Sam.btn.secondaryCombo} ${ROW_BTN}`}
          disabled={locked || !onReject}
          aria-busy={busy === "reject" || undefined}
          onClick={onReject}
        >
          {busy === "reject" ? <Spinner /> : t("cm_friend_cta_reject")}
        </button>
        <button
          type="button"
          className={`${Sam.btn.primaryCombo} ${ROW_BTN}`}
          disabled={locked || !onAccept}
          aria-busy={busy === "accept" || undefined}
          onClick={onAccept}
        >
          {busy === "accept" ? <Spinner /> : t("cm_friend_cta_accept")}
        </button>
      </span>
    );
  }

  /* layout === "sheet" */
  if (cta.kind === "friend") return null;
  if (cta.kind === "add_friend") {
    return (
      <DibayOverlayButton
        roleTone="primary"
        className="!flex-none w-full"
        disabled={locked || !onSend}
        loading={busy === "send"}
        onClick={onSend}
      >
        {t("cm_friend_cta_send_request")}
      </DibayOverlayButton>
    );
  }
  if (cta.kind === "pending_outgoing") {
    return (
      <div className="space-y-2">
        <p className="text-center sam-text-helper text-sam-muted">{t("cm_friend_status_outgoing_waiting")}</p>
        <DibayOverlayButton
          roleTone="secondary"
          className="!flex-none w-full"
          disabled={locked || !onCancel}
          loading={busy === "cancel"}
          onClick={() => setCancelConfirmOpen(true)}
        >
          {t("cm_friend_cta_cancel")}
        </DibayOverlayButton>
        {cancelConfirm}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-center sam-text-helper text-sam-muted">{t("cm_friend_status_incoming_waiting")}</p>
      <div className="flex gap-2">
        <DibayOverlayButton
          roleTone="secondary"
          disabled={locked || !onReject}
          loading={busy === "reject"}
          onClick={onReject}
        >
          {t("cm_friend_cta_reject")}
        </DibayOverlayButton>
        <DibayOverlayButton
          roleTone="primary"
          disabled={locked || !onAccept}
          loading={busy === "accept"}
          onClick={onAccept}
        >
          {t("cm_friend_cta_accept")}
        </DibayOverlayButton>
      </div>
    </div>
  );
}
