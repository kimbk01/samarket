"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayDialog, DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { PHILIFE_FB_INPUT_CLASS } from "@/lib/philife/philife-flat-ui-classes";

/** 모임 비밀번호 입력 전용 팝업 */
export function MeetingPasswordOnlyModal({
  open,
  onClose,
  onSubmit,
  busy,
  error = "",
  title,
  hint,
  submitLabel,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (password: string) => void;
  busy: boolean;
  error?: string | null;
  title?: string;
  hint?: string | null;
  submitLabel?: string;
}) {
  const { t } = useI18n();
  const resolvedTitle = title ?? t("community_join_password_title");
  const resolvedHint = hint === undefined ? t("community_meeting_password_modal_hint_open") : hint;
  const resolvedSubmit = submitLabel ?? t("community_meeting_join_submit");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (open) setPassword((prev) => (prev === "" ? prev : ""));
  }, [open]);

  return (
    <DibayDialog
      open={open}
      onClose={busy ? undefined : onClose}
      dismissible={!busy}
      title={resolvedTitle}
      description={resolvedHint || undefined}
    >
      <label className={`mt-1 block text-sm font-semibold text-[color:var(--overlay-text-primary)]`}>
        {t("community_password_label")}
      </label>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="off"
        className={`mt-2 w-full ${PHILIFE_FB_INPUT_CLASS}`}
        placeholder={t("community_password_input_placeholder")}
        disabled={busy}
      />
      {error ? <p className={`mt-2 ${OverlayUi.caption}`} style={{ color: "var(--overlay-danger)" }}>{error}</p> : null}
      <div className={`${OverlayUi.actionsStack} mt-4`}>
        <DibayOverlayButton
          roleTone="primary"
          disabled={busy || !password.trim()}
          loading={busy}
          onClick={() => onSubmit(password.trim())}
        >
          {busy ? t("community_meeting_password_checking") : resolvedSubmit}
        </DibayOverlayButton>
        <DibayOverlayButton roleTone="text" onClick={onClose} disabled={busy}>
          {t("common_close")}
        </DibayOverlayButton>
      </div>
    </DibayDialog>
  );
}
