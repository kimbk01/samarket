"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useRegisterMainTier1Header } from "@/lib/layout/use-register-main-tier1-header";
import { buildGroupRoomWebPath } from "@/lib/community-messenger/group/group-room-deeplink";
import type { MessageKey } from "@/lib/i18n/messages";
import { moimApi, moimErrorKey, moimRoutes } from "@/lib/moim/moim-client-api";
import type { MoimNotificationPrefsDto } from "@/lib/moim/moim-api-types";
import { useMoimDetail } from "@/components/moim/MoimDetailScreen";
import { MoimSwitch } from "@/components/moim/MoimScheduleFormScreen";
import { MoimEmptyState, MoimErrorState, MoimListSkeleton, moimCls, useMoimToast } from "@/components/moim/moim-ui";

const ROWS: { key: keyof MoimNotificationPrefsDto; label: MessageKey; hint: MessageKey }[] = [
  { key: "notice", label: "moim_notify_notice_label", hint: "moim_notify_notice_hint" },
  { key: "posts", label: "moim_notify_posts_label", hint: "moim_notify_posts_hint" },
  { key: "schedules", label: "moim_notify_schedules_label", hint: "moim_notify_schedules_hint" },
];

/** 모임 알림 설정 (시안 U10 아래쪽) /moim/[id]/settings/notifications — 이 모임에서 나에게만 적용 */
export function MoimNotificationSettingsScreen({ moimId }: { moimId: string }) {
  const { t } = useI18n();
  const toast = useMoimToast();
  const { moim, error, reload } = useMoimDetail(moimId);
  const [prefs, setPrefs] = useState<MoimNotificationPrefsDto | null>(null);
  const [prefsError, setPrefsError] = useState<string | null>(null);
  const [saving, setSaving] = useState<keyof MoimNotificationPrefsDto | null>(null);
  const [key, setKey] = useState(0);

  const header = useMemo(() => ({ titleText: t("moim_notify_title"), backHref: moimRoutes.home(moimId) }), [moimId, t]);
  useRegisterMainTier1Header(header);

  useEffect(() => {
    let alive = true;
    setPrefsError(null);
    void moimApi.notificationPrefs(moimId).then((r) => {
      if (!alive) return;
      if (r.ok) setPrefs(r.prefs);
      else setPrefsError(r.error);
    });
    return () => {
      alive = false;
    };
  }, [moimId, key]);

  /** 낙관 반영 → 실패하면 원래 값으로 되돌리고 알림 */
  const change = async (k: keyof MoimNotificationPrefsDto, next: boolean) => {
    if (!prefs || saving) return;
    const before = prefs;
    setPrefs({ ...prefs, [k]: next });
    setSaving(k);
    const r = await moimApi.setNotificationPrefs(moimId, { [k]: next });
    setSaving(null);
    if (!r.ok) {
      setPrefs(before);
      toast.show(t(moimErrorKey(r.error)), "error");
    }
  };

  const err = error ?? prefsError;
  if (err) {
    return (
      <div className={moimCls.page}>
        <MoimErrorState
          messageKey={moimErrorKey(err)}
          onRetry={() => {
            reload();
            setKey((x) => x + 1);
          }}
        />
      </div>
    );
  }
  if (!moim || !prefs) {
    return (
      <div className={`${moimCls.page} pt-3`}>
        <MoimListSkeleton rows={3} />
      </div>
    );
  }
  if (moim.viewer.status !== "active") {
    return (
      <div className={moimCls.page}>
        <MoimEmptyState>{t("moim_err_moim_not_member")}</MoimEmptyState>
      </div>
    );
  }

  return (
    <div className={moimCls.page}>
      <div className={`${moimCls.column} pb-10`}>
        <p className={`${moimCls.hint} px-4 pb-2 pt-4`}>{t("moim_notify_lead")}</p>
        <div className="border-y border-sam-border bg-sam-surface">
          {ROWS.map((row) => (
            <div key={row.key} className="flex items-center gap-3 border-b border-sam-border px-4 py-3 last:border-b-0">
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] text-sam-fg">{t(row.label)}</span>
                <span className={`${moimCls.hint} block`}>{t(row.hint)}</span>
              </span>
              <MoimSwitch checked={prefs[row.key]} disabled={saving === row.key} label={t(row.label)} onChange={(v) => void change(row.key, v)} />
            </div>
          ))}
          {moim.viewer.roomId ? (
            <Link href={buildGroupRoomWebPath(moim.viewer.roomId)} className="flex items-center gap-3 px-4 py-3 active:bg-sam-surface-muted">
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] text-sam-fg">{t("moim_notify_chat_label")}</span>
                <span className={`${moimCls.hint} block`}>{t("moim_notify_chat_hint")}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-sam-muted" aria-hidden />
            </Link>
          ) : null}
        </div>
        <p className={`${moimCls.noticeInfo} mx-4 mt-4`}>{t("moim_notify_always_note")}</p>
      </div>
      {toast.node}
    </div>
  );
}
