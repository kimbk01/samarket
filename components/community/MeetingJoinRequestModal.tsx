"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  PHILIFE_FB_INPUT_CLASS,
  PHILIFE_FB_TEXTAREA_CLASS,
} from "@/lib/philife/philife-flat-ui-classes";
import { DibayBottomSheet, DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

export type JoinRequestModalPayload = {
  nickname: string;
  intro: string;
  reason: string;
  note: string;
  password?: string;
};

export function MeetingJoinRequestModal({
  open,
  onClose,
  defaultNickname = "",
  requirePassword = false,
  onSubmit,
  busy = false,
  submitError = "",
}: {
  open: boolean;
  onClose: () => void;
  defaultNickname?: string;
  /** 비밀번호 방 + 승인 조합 등 */
  requirePassword?: boolean;
  onSubmit: (payload: JoinRequestModalPayload) => void;
  busy?: boolean;
  /** 전송 실패 시 모달 안에 표시 (아래 버튼과 무관하게 보이도록) */
  submitError?: string;
}) {
  const { t } = useI18n();
  const [nickname, setNickname] = useState(defaultNickname);
  const [intro, setIntro] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (open) {
      setNickname((prev) => (prev === defaultNickname ? prev : defaultNickname));
      setIntro((prev) => (prev === "" ? prev : ""));
      setReason((prev) => (prev === "" ? prev : ""));
      setNote((prev) => (prev === "" ? prev : ""));
      setPassword((prev) => (prev === "" ? prev : ""));
    }
  }, [open, defaultNickname]);

  const canSubmit =
    !busy &&
    (!requirePassword || password.trim().length > 0) &&
    nickname.trim().length > 0 &&
    reason.trim().length > 0;

  return (
    <DibayBottomSheet
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={t("community_join_request_title")}
      anchor="above-bottom-nav"
      footer={
        <div className={`${OverlayUi.actionsRow} mt-2 border-t border-[color:var(--overlay-border)] pt-3`}>
          <DibayOverlayButton roleTone="secondary" onClick={onClose} disabled={busy}>
            {t("common_cancel")}
          </DibayOverlayButton>
          <DibayOverlayButton
            roleTone="primary"
            disabled={!canSubmit}
            loading={busy}
            onClick={() =>
              onSubmit({
                nickname: nickname.trim(),
                intro: intro.trim(),
                reason: reason.trim(),
                note: note.trim(),
                ...(requirePassword ? { password: password.trim() } : {}),
              })
            }
          >
            {busy ? t("community_join_request_submitting") : t("community_join_request_send")}
          </DibayOverlayButton>
        </div>
      }
    >
      <div className="space-y-3">
        <p className={OverlayUi.bodySecondary}>{t("community_join_request_intro")}</p>
        <Field label={t("community_join_field_name")} required hint={t("community_join_field_name_hint")}>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={80}
            className={`mt-1 w-full ${PHILIFE_FB_INPUT_CLASS}`}
            placeholder={t("community_join_field_bk_placeholder")}
            disabled={busy}
          />
        </Field>
        <Field label={t("community_join_field_intro")}>
          <textarea
            value={intro}
            onChange={(e) => setIntro(e.target.value)}
            rows={2}
            maxLength={500}
            className={`mt-1 w-full resize-none ${PHILIFE_FB_TEXTAREA_CLASS}`}
            placeholder={t("community_join_field_area_placeholder")}
            disabled={busy}
          />
        </Field>
        <Field label={t("community_join_field_reason")} required>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={800}
            className={`mt-1 w-full resize-none ${PHILIFE_FB_TEXTAREA_CLASS}`}
            placeholder={t("community_join_field_message_placeholder")}
            disabled={busy}
          />
        </Field>
        <Field label={t("community_join_field_memo")}>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={500}
            className={`mt-1 w-full resize-none ${PHILIFE_FB_TEXTAREA_CLASS}`}
            placeholder={t("community_join_field_note_placeholder")}
            disabled={busy}
          />
        </Field>
        {requirePassword ? (
          <Field label={t("community_join_field_room_password")} required>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`mt-1 w-full ${PHILIFE_FB_INPUT_CLASS}`}
              placeholder={t("community_password_label")}
              disabled={busy}
            />
          </Field>
        ) : null}
        {submitError ? (
          <p
            className="rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-danger)]/20 bg-red-50 px-3 py-2 text-sm text-[color:var(--overlay-danger)]"
            role="alert"
          >
            {submitError}
          </p>
        ) : null}
      </div>
    </DibayBottomSheet>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="sam-form-field">
      <label className="sam-form-label">
        {label}
        {required ? <span className="sam-form-required"> *</span> : null}
      </label>
      {hint ? <p className="sam-form-description">{hint}</p> : null}
      {children}
    </div>
  );
}
