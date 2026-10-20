"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  getUserSettings,
  subscribeUserSettings,
  syncUserSettings,
  updateUserSettings,
} from "@/lib/settings/user-settings-store";
import {
  fetchMeNotificationSettingsGet,
  invalidateMeNotificationSettingsGetFlight,
} from "@/lib/me/fetch-me-notification-settings-client";
import type { MessageKey } from "@/lib/i18n/messages";
import { MyToggle } from "@/components/mypage/ds/MyToggle";
import { MyStateSkeleton } from "@/components/mypage/ds/MyStateView";
import { showMypageToast } from "@/lib/mypage/mypage-toast";
import { saveDualNotificationToggle } from "@/lib/mypage/notification-toggle-dual-save";
import { useMypageListRestore } from "@/lib/mypage/use-mypage-list-restore";
import { Sam } from "@/lib/ui/sam-component-classes";
import { SettingsSection } from "./SettingsSection";
import { WebPushSettingsRow } from "./WebPushSettingsRow";
import { NativePushSettingsRow } from "./NativePushSettingsRow";

/** 도메인 알림 설정(`/api/me/notification-settings`) 토글 키 */
type DomainToggleKey =
  | "sound_enabled"
  | "trade_chat_enabled"
  | "community_chat_enabled"
  | "order_enabled"
  | "store_enabled"
  | "vibration_enabled"
  | "trade_events_enabled"
  | "community_social_enabled"
  | "notice_enabled"
  | "quiet_hours_enabled";

type DomainState = Record<DomainToggleKey, boolean> & {
  quiet_hours_start: string;
  quiet_hours_end: string;
};

const DOMAIN_DEFAULTS: DomainState = {
  sound_enabled: true,
  trade_chat_enabled: true,
  community_chat_enabled: true,
  order_enabled: true,
  store_enabled: true,
  vibration_enabled: true,
  trade_events_enabled: true,
  community_social_enabled: true,
  notice_enabled: true,
  quiet_hours_enabled: false,
  quiet_hours_start: "22:00",
  quiet_hours_end: "08:00",
};

/**
 * PATCH `/api/me/notification-settings` — 성공 여부를 돌려준다(실패 무시 금지, S11).
 * 성공 시 GET 단일 비행 무효화 + `kasama:user-notification-settings-changed` 발행(기존 계약).
 */
export async function patchMeNotificationDomain(partial: Record<string, boolean | string | null>): Promise<boolean> {
  try {
    const res = await fetch("/api/me/notification-settings", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partial),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean };
    if (res.ok && j?.ok) {
      invalidateMeNotificationSettingsGetFlight();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("kasama:user-notification-settings-changed"));
      }
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function ToggleRow({
  label,
  hint,
  children,
  testId,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div className="border-b border-sam-border-soft px-3 py-2.5 last:border-b-0" data-testid={testId}>
      <div className="flex min-h-[44px] items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <span className="text-[15px] font-semibold text-sam-fg">{label}</span>
          {hint ? <div className="mt-0.5 text-[12px] leading-snug text-sam-muted">{hint}</div> : null}
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * 알림 설정 (최종 설계 S11) — 전체 푸시 → 채팅 → 거래 → 주문 → 커뮤니티 → 마케팅 → 알림 이메일 → 방해 금지·소리.
 * 모든 토글 = `MyToggle`(낙관 반영 → 실패 시 원래 값 + 토스트). 전체 푸시·마케팅은 두 저장소를 함께 바꾸고
 * 한쪽이라도 실패하면 둘 다 되돌린다.
 */
export function NotificationsSettingsContent() {
  const { t } = useI18n();
  const userId = getCurrentUser()?.id ?? "me";
  const [settings, setSettings] = useState(() => getUserSettings(userId));

  const [commerceEmailOn, setCommerceEmailOn] = useState(true);
  const [commerceEmailLoaded, setCommerceEmailLoaded] = useState(false);
  const [commerceEmailShowRow, setCommerceEmailShowRow] = useState(false);
  const [commerceEmailColumnMissing, setCommerceEmailColumnMissing] = useState(false);
  const [commerceEmailPatchError, setCommerceEmailPatchError] = useState<string | null>(null);

  const [domain, setDomain] = useState<DomainState>(DOMAIN_DEFAULTS);
  const [domainLoaded, setDomainLoaded] = useState(false);
  const [domainError, setDomainError] = useState(false);
  const [domainReloadKey, setDomainReloadKey] = useState(0);
  useMypageListRestore({ ready: domainLoaded });

  const refresh = useCallback(() => setSettings(getUserSettings(userId)), [userId]);
  useEffect(() => {
    refresh();
    void syncUserSettings(userId).then(() => refresh());
    return subscribeUserSettings(({ userId: changedUserId }) => {
      if (changedUserId === userId) refresh();
    });
  }, [refresh, userId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await runSingleFlight("me:profile:notification-email", () =>
          fetch("/api/me/profile/notification-email", { credentials: "include" })
        );
        if (cancelled) return;
        if (res.status === 401) {
          setCommerceEmailShowRow(false);
        } else {
          const j = await res.clone().json().catch(() => ({}));
          if (!cancelled && j?.ok) {
            setCommerceEmailShowRow(true);
            setCommerceEmailOn(j.notify_commerce_email !== false);
            setCommerceEmailColumnMissing(j.column_missing === true);
            setCommerceEmailPatchError(null);
          } else if (!cancelled) {
            setCommerceEmailShowRow(false);
          }
        }
      } catch {
        /* 행 숨김 — 이메일 알림은 보조 영역(부분 오류는 그 칸만 비움) */
      } finally {
        if (!cancelled) setCommerceEmailLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetchMeNotificationSettingsGet();
        const j = (await res.clone().json().catch(() => ({}))) as {
          ok?: boolean;
          settings?: Partial<Record<DomainToggleKey, boolean>> & {
            quiet_hours_start?: string | null;
            quiet_hours_end?: string | null;
          };
        };
        if (cancelled) return;
        // 실패 시 기본값 토글을 로드된 것처럼 보이지 않게 오류 표시
        if (!res.ok || !j?.ok || !j.settings) {
          setDomainError(true);
          return;
        }
        setDomainError(false);
        const s = j.settings;
        setDomain({
          sound_enabled: s.sound_enabled !== false,
          trade_chat_enabled: s.trade_chat_enabled !== false,
          community_chat_enabled: s.community_chat_enabled !== false,
          order_enabled: s.order_enabled !== false,
          store_enabled: s.store_enabled !== false,
          vibration_enabled: s.vibration_enabled !== false,
          trade_events_enabled: s.trade_events_enabled !== false,
          community_social_enabled: s.community_social_enabled !== false,
          notice_enabled: s.notice_enabled !== false,
          quiet_hours_enabled: s.quiet_hours_enabled === true,
          quiet_hours_start:
            typeof s.quiet_hours_start === "string" && s.quiet_hours_start.trim() ? s.quiet_hours_start : "22:00",
          quiet_hours_end:
            typeof s.quiet_hours_end === "string" && s.quiet_hours_end.trim() ? s.quiet_hours_end : "08:00",
        });
      } catch {
        if (!cancelled) setDomainError(true);
      } finally {
        if (!cancelled) setDomainLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, domainReloadKey]);

  const retryDomain = useCallback(() => {
    invalidateMeNotificationSettingsGetFlight();
    setDomainError(false);
    setDomainLoaded(false);
    setDomainReloadKey((k) => k + 1);
  }, []);

  /** 도메인 토글 — 낙관 반영 → PATCH → 실패 시 원래 값 복귀(토스트는 `MyToggle`) */
  const toggleDomain = useCallback(
    async (key: DomainToggleKey, next: boolean): Promise<boolean> => {
      const prev = domain[key];
      setDomain((d) => ({ ...d, [key]: next }));
      const ok = await patchMeNotificationDomain({ [key]: next });
      if (!ok) setDomain((d) => ({ ...d, [key]: prev }));
      return ok;
    },
    [domain],
  );

  const saveQuietTime = useCallback(
    async (key: "quiet_hours_start" | "quiet_hours_end", value: string) => {
      const prev = domain[key];
      setDomain((d) => ({ ...d, [key]: value }));
      const ok = await patchMeNotificationDomain({ [key]: value });
      if (!ok) {
        setDomain((d) => ({ ...d, [key]: prev }));
        showMypageToast(t("mypage_settings_save_failed_reverted"), "error");
      }
    },
    [domain, t],
  );

  const saveUserSetting = useCallback(
    (partial: Parameters<typeof updateUserSettings>[1]) => updateUserSettings(userId, partial),
    [userId],
  );

  const pushOn = settings.push_enabled !== false;
  const marketingOn = settings.marketing_push_enabled === true;

  const domainRows: { key: DomainToggleKey; labelKey: MessageKey; hintKey?: MessageKey }[][] = [
    /* 거래 */
    [
      { key: "trade_chat_enabled", labelKey: "settings_notif_trade_chat", hintKey: "settings_notif_domain_hint" },
      { key: "trade_events_enabled", labelKey: "settings_notif_trade_events" },
    ],
    /* 주문 */
    [
      { key: "order_enabled", labelKey: "settings_notif_order" },
      { key: "store_enabled", labelKey: "settings_notif_store" },
    ],
    /* 커뮤니티 */
    [
      { key: "community_chat_enabled", labelKey: "settings_notif_community_chat" },
      { key: "community_social_enabled", labelKey: "settings_notif_community_social" },
      { key: "notice_enabled", labelKey: "settings_notif_notice" },
    ],
  ];

  const domainSkeletonLabels = [
    t("settings_notif_trade_chat"),
    t("settings_notif_trade_events"),
    t("settings_notif_order"),
    t("settings_notif_store"),
    t("settings_notif_community_chat"),
    t("settings_notif_community_social"),
    t("settings_notif_notice"),
  ];

  const renderDomainToggle = (key: DomainToggleKey, label: string) => (
    <MyToggle checked={domain[key]} ariaLabel={label} onChange={(next) => toggleDomain(key, next)} />
  );

  const timeInputClass = `${Sam.input.base} ${Sam.focusRing} !min-h-[40px] w-auto rounded-ui-rect !py-1.5 text-[16px]`;

  return (
    <div className="space-y-2" data-testid="notifications-settings">
      <SettingsSection title={t("common_notifications")} titleClassName="!text-[12px] !font-semibold">
        <ToggleRow label={t("notifications_all")} testId="notif-row-all">
          <MyToggle
            checked={pushOn}
            ariaLabel={t("notifications_all")}
            onChange={(next) =>
              saveDualNotificationToggle({
                next,
                prev: pushOn,
                saveUser: (v) => saveUserSetting({ push_enabled: v }),
                saveDomain: (v) => patchMeNotificationDomain({ service_enabled: v }),
              })
            }
          />
        </ToggleRow>
        <ToggleRow label={t("notifications_chat")}>
          <MyToggle
            checked={settings.chat_push_enabled !== false}
            ariaLabel={t("notifications_chat")}
            onChange={(next) => saveUserSetting({ chat_push_enabled: next })}
          />
        </ToggleRow>
        <WebPushSettingsRow pushEnabled={pushOn} />
        <NativePushSettingsRow pushEnabled={pushOn} />
      </SettingsSection>

      {!domainLoaded ? (
        <section className="pt-4" data-testid="notif-domain-skeleton">
          <MyStateSkeleton template="settings" rowLabels={domainSkeletonLabels} />
        </section>
      ) : domainError ? (
        <section className="pt-4">
          <div className="sam-settings-group px-3 py-2.5" role="alert" data-testid="notif-domain-error">
            <p className="text-[12px] leading-snug text-sam-danger">{t("settings_notif_domain_load_failed")}</p>
            <button
              type="button"
              className={`${Sam.btn.secondaryCombo} ${Sam.btn.sm} ${Sam.focusRing} mt-2`}
              onClick={retryDomain}
            >
              {t("common_retry")}
            </button>
          </div>
        </section>
      ) : (
        <>
          {domainRows.map((group, gi) => (
            <SettingsSection
              key={gi}
              title={
                gi === 0
                  ? t("mypage_s11_group_trade")
                  : gi === 1
                    ? t("mypage_s11_group_order")
                    : t("mypage_s11_group_community")
              }
              titleClassName="!text-[12px] !font-semibold"
            >
              {group.map((row) => (
                <ToggleRow
                  key={row.key}
                  label={t(row.labelKey)}
                  hint={row.hintKey ? t(row.hintKey) : undefined}
                  testId={`notif-row-${row.key}`}
                >
                  {renderDomainToggle(row.key, t(row.labelKey))}
                </ToggleRow>
              ))}
            </SettingsSection>
          ))}
        </>
      )}

      <SettingsSection title={t("mypage_s11_group_marketing")} titleClassName="!text-[12px] !font-semibold">
        <ToggleRow label={t("notifications_marketing")} testId="notif-row-marketing">
          <MyToggle
            checked={marketingOn}
            ariaLabel={t("notifications_marketing")}
            onChange={(next) =>
              saveDualNotificationToggle({
                next,
                prev: marketingOn,
                saveUser: (v) => saveUserSetting({ marketing_push_enabled: v }),
                saveDomain: (v) => patchMeNotificationDomain({ marketing_enabled: v }),
              })
            }
          />
        </ToggleRow>
        {!commerceEmailLoaded ? (
          <ToggleRow label={t("notifications_commerce_email")}>
            <span className="h-[31px] w-[51px] shrink-0 rounded-full bg-sam-border-soft/70 motion-safe:animate-pulse" />
          </ToggleRow>
        ) : null}
        {commerceEmailLoaded && commerceEmailShowRow ? (
          <ToggleRow
            label={t("notifications_commerce_email")}
            hint={
              <>
                {t("notifications_commerce_email_desc")}
                {commerceEmailColumnMissing ? (
                  <span className="mt-1 block text-[11px] leading-snug text-sam-warning">
                    {t("settings_notif_db_migration", { file: "manual-apply-notifications-full.sql" })}
                  </span>
                ) : null}
                {commerceEmailPatchError ? (
                  <span className="mt-1 block text-[11px] leading-snug text-sam-danger">{commerceEmailPatchError}</span>
                ) : null}
              </>
            }
          >
            <MyToggle
              checked={commerceEmailOn}
              disabled={commerceEmailColumnMissing}
              ariaLabel={t("notifications_commerce_email")}
              onChange={async (next) => {
                setCommerceEmailPatchError(null);
                try {
                  const res = await fetch("/api/me/profile/notification-email", {
                    method: "PATCH",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ notify_commerce_email: next }),
                  });
                  const j = await res.json().catch(() => ({}));
                  if (res.ok && j?.ok) {
                    setCommerceEmailOn(next);
                    return true;
                  }
                  if (j?.error === "column_missing") setCommerceEmailColumnMissing(true);
                  else if (j?.error === "profile_not_found") setCommerceEmailPatchError(t("notifications_profile_missing"));
                  return false;
                } catch {
                  return false;
                }
              }}
            />
          </ToggleRow>
        ) : null}
      </SettingsSection>

      <SettingsSection title={t("notifications_dnd")} titleClassName="!text-[12px] !font-semibold">
        {domainLoaded && !domainError ? (
          <ToggleRow label={t("settings_notif_quiet_hours")} hint={t("settings_notif_quiet_hint")}>
            {renderDomainToggle("quiet_hours_enabled", t("settings_notif_quiet_hours"))}
          </ToggleRow>
        ) : null}
        {domainLoaded && !domainError && domain.quiet_hours_enabled ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-sam-border-soft px-3 py-2.5">
            <input
              type="time"
              aria-label={t("settings_notif_quiet_hours")}
              value={domain.quiet_hours_start}
              onChange={(e) => void saveQuietTime("quiet_hours_start", e.target.value)}
              className={timeInputClass}
            />
            <span className="text-sam-muted">~</span>
            <input
              type="time"
              aria-label={t("settings_notif_quiet_hours")}
              value={domain.quiet_hours_end}
              onChange={(e) => void saveQuietTime("quiet_hours_end", e.target.value)}
              className={timeInputClass}
            />
          </div>
        ) : null}
        <ToggleRow label={t("notifications_use")}>
          <MyToggle
            checked={settings.do_not_disturb_enabled === true}
            ariaLabel={t("notifications_dnd")}
            onChange={(next) => saveUserSetting({ do_not_disturb_enabled: next })}
          />
        </ToggleRow>
        {settings.do_not_disturb_enabled === true ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-sam-border-soft px-3 py-2.5">
            <input
              type="time"
              aria-label={t("notifications_dnd")}
              value={settings.do_not_disturb_start ?? "22:00"}
              onChange={(e) => void saveUserSetting({ do_not_disturb_start: e.target.value })}
              className={timeInputClass}
            />
            <span className="text-sam-muted">~</span>
            <input
              type="time"
              aria-label={t("notifications_dnd")}
              value={settings.do_not_disturb_end ?? "08:00"}
              onChange={(e) => void saveUserSetting({ do_not_disturb_end: e.target.value })}
              className={timeInputClass}
            />
          </div>
        ) : null}
      </SettingsSection>

      {domainLoaded && !domainError ? (
        <SettingsSection title={t("mypage_s11_group_sound")} titleClassName="!text-[12px] !font-semibold">
          <ToggleRow label={t("settings_notif_inapp_sound")}>
            {renderDomainToggle("sound_enabled", t("settings_notif_inapp_sound"))}
          </ToggleRow>
          <ToggleRow label={t("settings_notif_vibration")}>
            {renderDomainToggle("vibration_enabled", t("settings_notif_vibration"))}
          </ToggleRow>
        </SettingsSection>
      ) : null}
    </div>
  );
}
