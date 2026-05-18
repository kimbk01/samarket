"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  COMMUNITY_BUTTON_PRIMARY_CLASS,
  COMMUNITY_MODAL_PANEL_CLASS,
  COMMUNITY_OVERLAY_BACKDROP_CLASS,
  PHILIFE_FB_INPUT_CLASS,
} from "@/lib/philife/philife-flat-ui-classes";

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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="m-pwd-title"
    >
      <button type="button" className={COMMUNITY_OVERLAY_BACKDROP_CLASS} aria-label={t("common_close")} onClick={onClose} />
      <div className={`relative z-50 ${COMMUNITY_MODAL_PANEL_CLASS}`}>
        <div className="flex items-center justify-between border-b border-[#E5E7EB] px-4 py-3">
          <h2 id="m-pwd-title" className="text-[16px] font-bold leading-[1.35] text-[#1F2430]">
            {resolvedTitle}
          </h2>
          <button
            type="button"
            className="rounded-[4px] px-2 py-1 text-[12px] text-[#6B7280] hover:bg-[#F7F8FA] disabled:opacity-40"
            onClick={onClose}
            disabled={busy}
          >
            {t("common_close")}
          </button>
        </div>
        <div className="space-y-3 px-4 py-4">
          {resolvedHint ? <p className="text-[13px] font-normal leading-[1.45] text-[#6B7280]">{resolvedHint}</p> : null}
          <label className="block text-[13px] font-semibold text-[#1F2430]">{t("community_password_label")}</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
            className={`w-full ${PHILIFE_FB_INPUT_CLASS}`}
            placeholder={t("community_password_input_placeholder")}
            disabled={busy}
          />
          {error ? <p className="text-[12px] text-[#E25555]">{error}</p> : null}
          <button
            type="button"
            disabled={busy || !password.trim()}
            className={`w-full ${COMMUNITY_BUTTON_PRIMARY_CLASS}`}
            onClick={() => onSubmit(password.trim())}
          >
            {busy ? t("community_meeting_password_checking") : resolvedSubmit}
          </button>
        </div>
      </div>
    </div>
  );
}
