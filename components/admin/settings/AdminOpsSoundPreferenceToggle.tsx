"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminSwitch } from "@/components/admin/ui/AdminSwitch";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  ADMIN_OPS_SOUND_PREFERENCE_CHANGED,
  fetchAdminNotificationPreferencesRow,
  invalidateAdminNotificationPreferencesFlight,
} from "@/lib/notifications/fetch-admin-notification-preferences-client";

/**
 * D-8 (재감사 P-12) — 본인 관리자 운영 알림음 켜기/끄기.
 * 행이 없으면 기본 켜짐(정규화 규칙과 같음). 저장 실패 시 이전 값으로 되돌린다.
 */
export function AdminOpsSoundPreferenceToggle() {
  const { language } = useI18n();
  const ko = language === "ko";
  const [enabled, setEnabled] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const uid = getCurrentUser()?.id?.trim() ?? "";
    if (!uid) {
      setLoaded(true);
      return;
    }
    void fetchAdminNotificationPreferencesRow(uid).then((row) => {
      if (cancelled) return;
      setEnabled(row?.sound_enabled !== false);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(
    async (next: boolean) => {
      const prev = enabled;
      setEnabled(next);
      setSaving(true);
      setFailed(false);
      try {
        const res = await fetch("/api/admin/me/notification-preferences", {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sound_enabled: next }),
        });
        const json = (await res.json().catch(() => null)) as { ok?: boolean } | null;
        if (!res.ok || !json?.ok) throw new Error("save_failed");
        const uid = getCurrentUser()?.id?.trim() ?? "";
        if (uid) invalidateAdminNotificationPreferencesFlight(uid);
        window.dispatchEvent(new Event(ADMIN_OPS_SOUND_PREFERENCE_CHANGED));
      } catch {
        setEnabled(prev);
        setFailed(true);
      } finally {
        setSaving(false);
      }
    },
    [enabled]
  );

  const label = ko ? "운영 알림음 (내 계정)" : "Ops alert sound (my account)";
  return (
    <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-sam-fg">{label}</p>
          <p className="mt-0.5 text-[12px] text-sam-muted">
            {ko
              ? "신고·충전·문의 등 처리 대기 알림이 올 때 이 브라우저에서 소리를 냅니다."
              : "Play a sound in this browser when new action-queue items arrive."}
          </p>
          {failed ? (
            <p role="alert" className="mt-1 text-[12px] text-sam-danger">
              {ko ? "저장하지 못했습니다. 새로고침 후 다시 저장해 주세요." : "Could not save. Refresh and save again."}
            </p>
          ) : null}
        </div>
        <AdminSwitch
          checked={enabled}
          onChange={(next) => void save(next)}
          disabled={!loaded || saving}
          label={label}
        />
      </div>
    </section>
  );
}
