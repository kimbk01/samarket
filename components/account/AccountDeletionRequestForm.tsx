"use client";

import Link from "next/link";
import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MYPAGE_MAIN_HREF } from "@/lib/my/mypage-info-hub";

type Props = {
  source: "mypage_settings" | "web_delete_request";
};

export function AccountDeletionRequestForm({ source }: Props) {
  const { t } = useI18n();
  const confirmWord = t("ui_account_delete_confirm_word");
  const [confirmationText, setConfirmationText] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (confirmationText.trim() !== confirmWord) {
      setError(t("ui_account_delete_confirm_err"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/me/leave-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          confirmationText: confirmationText.trim(),
          reason: reason.trim() || null,
          source,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        requestedAt?: string;
      };
      if (!res.ok || !json.ok) {
        setError(typeof json.error === "string" ? json.error : t("ui_account_delete_submit_err"));
        return;
      }
      setSubmittedAt(typeof json.requestedAt === "string" ? json.requestedAt : new Date().toISOString());
    } catch {
      setError(t("ui_account_delete_submit_err"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-body font-semibold text-sam-fg">{t("ui_account_delete_data_title")}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 sam-text-body-secondary text-sam-muted">
          <li>{t("ui_account_delete_data_1")}</li>
          <li>{t("ui_account_delete_data_2")}</li>
          <li>{t("ui_account_delete_data_3")}</li>
        </ul>
      </div>

      <div className="rounded-ui-rect border border-amber-200 bg-amber-50 p-4">
        <p className="sam-text-body font-semibold text-sam-fg">{t("ui_account_retain_title")}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 sam-text-body-secondary text-sam-fg">
          <li>{t("ui_account_retain_1")}</li>
          <li>{t("ui_account_retain_2")}</li>
          <li>{t("ui_account_retain_3")}</li>
        </ul>
      </div>

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <label className="block text-[13px] font-semibold text-sam-fg">{t("ui_account_delete_reason_label")}</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body"
          placeholder={t("ui_account_delete_reason_ph")}
        />
      </div>

      <div className="rounded-ui-rect border border-red-200 bg-red-50 p-4">
        <label className="block text-[13px] font-semibold text-red-800">{t("ui_account_delete_confirm_label")}</label>
        <p className="mt-1 sam-text-body-secondary text-red-700">{t("ui_account_delete_confirm_hint")}</p>
        <input
          type="text"
          value={confirmationText}
          onChange={(e) => setConfirmationText(e.target.value)}
          className="mt-3 w-full rounded-ui-rect border border-red-200 bg-white px-3 py-2 sam-text-body"
          placeholder={t("ui_account_delete_confirm_ph")}
        />
      </div>

      {submittedAt ? (
        <div className="rounded-ui-rect border border-emerald-200 bg-emerald-50 p-4">
          <p className="sam-text-body font-medium text-emerald-800">{t("ui_account_delete_submitted")}</p>
          <p className="mt-1 sam-text-body-secondary text-emerald-700">
            {t("ui_account_delete_submitted_at", {
              time: new Date(submittedAt).toLocaleString(),
            })}
          </p>
        </div>
      ) : null}
      {error ? (
        <div className="rounded-ui-rect border border-red-200 bg-red-50 p-4 sam-text-body-secondary text-red-600">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {source === "mypage_settings" ? (
          <Link
            href={MYPAGE_MAIN_HREF}
            className="rounded-ui-rect border border-sam-border px-4 py-2 sam-text-body font-medium text-sam-fg"
          >
            {t("common_cancel")}
          </Link>
        ) : null}
        <button
          type="button"
          disabled={submitting || submittedAt != null}
          onClick={() => void handleConfirm()}
          className="rounded-ui-rect bg-red-500 px-4 py-2 sam-text-body font-medium text-white disabled:opacity-50"
        >
          {submitting ? t("ui_account_delete_submitting") : t("ui_account_delete_submit")}
        </button>
      </div>
    </div>
  );
}
