"use client";

import { dibayConfirm } from "@/components/ui/dibay-overlay";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { philifeMeetingApi } from "@domain/philife/api";
import { formatKorDateTime } from "@/lib/ui/format-meeting-date";

interface MeetingPendingCardProps {
  meetingId: string;
  hostUserId: string;
  requestedAt?: string | null;
}

export function MeetingPendingCard({ meetingId, hostUserId, requestedAt }: MeetingPendingCardProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const mApi = philifeMeetingApi(meetingId);

  const onCancel = async () => {
    if (!(await dibayConfirm({ title: t("meeting_pending_cancel_confirm"), cancelLabel: t("common_cancel"), confirmLabel: t("common_confirm"), confirmTone: "destructive" }))) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(mApi.leave(), { method: "POST" });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? t("meeting_pending_cancel_failed"));
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const onInquiry = () => {
    if (!hostUserId) return;
    router.push(`/chats/new?peerId=${encodeURIComponent(hostUserId)}`);
  };

  return (
    <div className="mx-0 mt-4 overflow-hidden rounded-ui-rect border border-amber-200 bg-sam-surface shadow-sm">
      {/* 상단 상태 바 */}
      <div className="flex items-center gap-3 bg-amber-50 px-5 py-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
          <span className="sam-text-page-title">⏳</span>
        </div>
        <div>
          <p className="sam-text-body font-bold text-amber-900">{t("meeting_pending_title")}</p>
          <p className="sam-text-helper text-amber-700">{t("meeting_pending_subtitle")}</p>
        </div>
      </div>

      {/* 안내 내용 */}
      <div className="px-5 py-4">
        <ul className="space-y-2 sam-text-body-secondary text-sam-muted">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-emerald-500">✓</span>
            {t("meeting_pending_hint_approved")}
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-emerald-500">✓</span>
            {t("meeting_pending_hint_notify")}
          </li>
          {requestedAt && (
            <li className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-sam-meta">·</span>
              <span className="text-sam-meta">
                {t("meeting_pending_requested_at", { date: formatKorDateTime(requestedAt) })}
              </span>
            </li>
          )}
        </ul>

        {err && <p className="mt-3 sam-text-helper text-red-600">{err}</p>}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onInquiry}
            className="flex-1 rounded-ui-rect border border-sam-border py-3 sam-text-body-secondary font-semibold text-sam-fg hover:bg-sam-app"
          >
            {t("meeting_pending_contact_host")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onCancel()}
            className="flex-1 rounded-ui-rect bg-amber-500 py-3 sam-text-body-secondary font-semibold text-white disabled:opacity-50 hover:bg-amber-600"
          >
            {busy ? t("community_meeting_join_processing") : t("meeting_pending_cancel_request")}
          </button>
        </div>
      </div>
    </div>
  );
}
