"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { philifeMeetingApi } from "@domain/philife/api";
import type { NeighborhoodMeetingDetailDTO } from "@/lib/neighborhood/types";

interface MeetingSettingsPanelProps {
  meeting: NeighborhoodMeetingDetailDTO;
}

export function MeetingSettingsPanel({ meeting }: MeetingSettingsPanelProps) {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const focusHost = searchParams.get("focus") === "host";
  useEffect(() => {
    if (focusHost) setOpen(true);
  }, [focusHost]);

  const [welcomeMsg, setWelcomeMsg] = useState(meeting.welcome_message ?? "");
  const [allowFeed, setAllowFeed] = useState(meeting.allow_feed !== false);
  const [allowAlbum, setAllowAlbum] = useState(meeting.allow_album_upload !== false);
  const [maxMembers, setMaxMembers] = useState(String(meeting.max_members || ""));

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");

  const onSave = async () => {
    setSaving(true);
    setSaved(false);
    setErr("");
    try {
      const mApi = philifeMeetingApi(meeting.id);
      const res = await fetch(mApi.detail, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          welcome_message: welcomeMsg.trim() || null,
          allow_feed: allowFeed,
          allow_album_upload: allowAlbum,
          max_members: maxMembers ? Number(maxMembers) : undefined,
        }),
      });
      const j = (await res.json()) as { ok: boolean; error?: string };
      if (!j.ok) {
        setErr(j.error ?? t("common_save_failed"));
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      startTransition(() => router.refresh());
    } catch {
      setErr(t("common_network_error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div id="meeting-settings-accordion" className="rounded-ui-rect border border-sam-border-soft bg-sam-surface shadow-sm">
      {/* 헤더 (토글) */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3.5"
      >
        <span className="sam-text-body font-semibold text-sam-fg">{t("meeting_settings_title")}</span>
        <span className="sam-text-page-title leading-none text-sam-meta">{open ? "∧" : "∨"}</span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-sam-border-soft px-4 pb-4 pt-3">
          {/* 환영 메시지 */}
          <div>
            <label className="block sam-text-helper font-semibold text-sam-fg">
              {t("meeting_settings_welcome_label")}
            </label>
            <p className="mb-1 sam-text-xxs text-sam-meta">{t("meeting_settings_welcome_hint")}</p>
            <textarea
              value={welcomeMsg}
              onChange={(e) => setWelcomeMsg(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder={t("meeting_settings_welcome_placeholder")}
              className="w-full resize-none rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body-secondary text-sam-fg placeholder-sam-meta outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200"
            />
            <p className="mt-0.5 text-right sam-text-xxs text-sam-meta">{welcomeMsg.length}/500</p>
          </div>

          {/* 최대 인원 */}
          <div>
            <label className="block sam-text-helper font-semibold text-sam-fg">
              {t("meeting_settings_max_members")}
            </label>
            <input
              type="number"
              min={2}
              max={500}
              value={maxMembers}
              onChange={(e) => setMaxMembers(e.target.value)}
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body-secondary text-sam-fg outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200"
              placeholder={String(meeting.max_members || 20)}
            />
          </div>

          {/* 피드 허용 토글 */}
          <div className="flex items-center justify-between">
            <div>
              <p className="sam-text-body-secondary font-medium text-sam-fg">{t("meeting_settings_allow_feed")}</p>
              <p className="sam-text-xxs text-sam-meta">{t("meeting_settings_allow_feed_hint")}</p>
            </div>
            <button
              type="button"
              onClick={() => setAllowFeed((v) => !v)}
              className={`relative h-6 w-11 rounded-full transition-colors ${
                allowFeed ? "bg-emerald-500" : "bg-sam-border-soft"
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-sam-surface shadow transition-transform ${
                  allowFeed ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          {/* 앨범 업로드 허용 토글 */}
          <div className="flex items-center justify-between">
            <div>
              <p className="sam-text-body-secondary font-medium text-sam-fg">{t("meeting_settings_allow_album")}</p>
              <p className="sam-text-xxs text-sam-meta">{t("meeting_settings_allow_album_hint")}</p>
            </div>
            <button
              type="button"
              onClick={() => setAllowAlbum((v) => !v)}
              className={`relative h-6 w-11 rounded-full transition-colors ${
                allowAlbum ? "bg-emerald-500" : "bg-sam-border-soft"
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-sam-surface shadow transition-transform ${
                  allowAlbum ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          {/* 에러 / 성공 메시지 */}
          {err && <p className="sam-text-helper text-red-500">{err}</p>}
          {saved && <p className="sam-text-helper text-emerald-600">{t("meeting_settings_saved")}</p>}

          {/* 저장 버튼 */}
          <button
            type="button"
            disabled={saving}
            onClick={() => void onSave()}
            className="w-full rounded-ui-rect bg-emerald-500 py-2.5 sam-text-body font-semibold text-white disabled:opacity-50"
          >
            {saving ? t("meeting_settings_saving") : t("meeting_settings_save")}
          </button>
        </div>
      )}
    </div>
  );
}
