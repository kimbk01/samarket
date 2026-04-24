"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  getUserSettings,
  subscribeUserSettings,
  syncUserSettings,
  updateUserSettings,
} from "@/lib/settings/user-settings-store";
import { SettingsSection } from "./SettingsSection";
import { WebPushSettingsRow } from "./WebPushSettingsRow";

export function NotificationsSettingsContent() {
  const { t } = useI18n();
  const userId = getCurrentUser()?.id ?? "me";
  const [settings, setSettings] = useState(() => getUserSettings(userId));

  const [commerceEmailOn, setCommerceEmailOn] = useState(true);
  const [commerceEmailLoaded, setCommerceEmailLoaded] = useState(false);
  const [commerceEmailShowRow, setCommerceEmailShowRow] = useState(false);
  const [commerceEmailColumnMissing, setCommerceEmailColumnMissing] = useState(false);
  const [commerceEmailBusy, setCommerceEmailBusy] = useState(false);
  const [commerceEmailPatchError, setCommerceEmailPatchError] = useState<string | null>(null);

  const [domainSoundOn, setDomainSoundOn] = useState(true);
  const [domainTradeChatOn, setDomainTradeChatOn] = useState(true);
  const [domainCommunityChatOn, setDomainCommunityChatOn] = useState(true);
  const [domainOrderOn, setDomainOrderOn] = useState(true);
  const [domainStoreOn, setDomainStoreOn] = useState(true);
  const [domainVibrationOn, setDomainVibrationOn] = useState(true);
  const [domainLoaded, setDomainLoaded] = useState(false);

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
        const res = await fetch("/api/me/profile/notification-email", { credentials: "include" });
        if (cancelled) return;
        if (res.status === 401) {
          setCommerceEmailShowRow(false);
          return;
        }
        const j = await res.json().catch(() => ({}));
        if (!cancelled && j?.ok) {
          setCommerceEmailShowRow(true);
          setCommerceEmailOn(j.notify_commerce_email !== false);
          setCommerceEmailColumnMissing(j.column_missing === true);
          setCommerceEmailPatchError(null);
        } else if (!cancelled) {
          setCommerceEmailShowRow(false);
        }
      } catch {
        /* ignore */
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
        const res = await fetch("/api/me/notification-settings", { credentials: "include" });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          settings?: {
            sound_enabled?: boolean;
            trade_chat_enabled?: boolean;
            community_chat_enabled?: boolean;
            order_enabled?: boolean;
            store_enabled?: boolean;
            vibration_enabled?: boolean;
          };
        };
        if (cancelled || !j?.ok || !j.settings) return;
        const s = j.settings;
        setDomainSoundOn(s.sound_enabled !== false);
        setDomainTradeChatOn(s.trade_chat_enabled !== false);
        setDomainCommunityChatOn(s.community_chat_enabled !== false);
        setDomainOrderOn(s.order_enabled !== false);
        setDomainStoreOn(s.store_enabled !== false);
        setDomainVibrationOn(s.vibration_enabled !== false);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setDomainLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const patchDomain = useCallback(
    async (partial: Record<string, boolean>) => {
      try {
        const res = await fetch("/api/me/notification-settings", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(partial),
        });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean };
        if (res.ok && j?.ok && typeof window !== "undefined") {
          window.dispatchEvent(new Event("kasama:user-notification-settings-changed"));
        }
      } catch {
        /* ignore */
      }
    },
    []
  );

  const update = useCallback(
    (partial: Parameters<typeof updateUserSettings>[1]) => {
      updateUserSettings(userId, partial);
      refresh();
    },
    [userId, refresh]
  );

  return (
    <div className="space-y-2">
      <SettingsSection title={t("common_notifications")} titleClassName="!text-[12px] !font-semibold">
        <div className="border-b border-sam-border-soft px-3 py-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-medium text-sam-fg">{t("notifications_all")}</span>
            <button
              type="button"
              role="switch"
              aria-checked={settings.push_enabled ?? true}
              onClick={() => update({ push_enabled: !(settings.push_enabled ?? true) })}
              className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
                settings.push_enabled !== false ? "bg-signature" : "bg-sam-border-soft"
              }`}
            >
              <span
                className={`inline-block h-6 w-6 rounded-full bg-sam-surface shadow transition-transform ${
                  settings.push_enabled !== false ? "translate-x-6" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        </div>
        <div className="border-b border-sam-border-soft px-3 py-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-medium text-sam-fg">{t("notifications_chat")}</span>
            <button
              type="button"
              role="switch"
              aria-checked={settings.chat_push_enabled ?? true}
              onClick={() => update({ chat_push_enabled: !(settings.chat_push_enabled ?? true) })}
              className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
                settings.chat_push_enabled !== false ? "bg-signature" : "bg-sam-border-soft"
              }`}
            >
              <span
                className={`inline-block h-6 w-6 rounded-full bg-sam-surface shadow transition-transform ${
                  settings.chat_push_enabled !== false ? "translate-x-6" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        </div>
        <div className="border-b border-sam-border-soft px-3 py-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-medium text-sam-fg">{t("notifications_marketing")}</span>
            <button
              type="button"
              role="switch"
              aria-checked={settings.marketing_push_enabled ?? false}
              onClick={() => update({ marketing_push_enabled: !(settings.marketing_push_enabled ?? false) })}
              className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
                settings.marketing_push_enabled ? "bg-signature" : "bg-sam-border-soft"
              }`}
            >
              <span
                className={`inline-block h-6 w-6 rounded-full bg-sam-surface shadow transition-transform ${
                  settings.marketing_push_enabled ? "translate-x-6" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        </div>
        <WebPushSettingsRow pushEnabled={settings.push_enabled !== false} />
        {!commerceEmailLoaded ? (
          <div className="border-b border-sam-border-soft px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="h-4 w-28 rounded bg-sam-surface-muted" />
                <div className="mt-2 h-3 w-44 rounded bg-sam-app" />
              </div>
              <div className="h-7 w-12 rounded-full bg-sam-surface-muted" />
            </div>
          </div>
        ) : null}
        {commerceEmailLoaded && commerceEmailShowRow ? (
          <div className="border-b border-sam-border-soft px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <span className="text-[14px] font-medium text-sam-fg">{t("notifications_commerce_email")}</span>
                <p className="mt-0.5 text-[11px] leading-snug text-sam-muted">
                  {t("notifications_commerce_email_desc")}
                  {commerceEmailColumnMissing ? (
                    <span className="mt-1 block text-[11px] leading-snug text-amber-700">
                      DB에 컬럼이 없어 저장할 수 없습니다.{" "}
                      <code className="rounded bg-sam-surface-muted px-0.5">manual-apply-notifications-full.sql</code> 을 적용해
                      주세요.
                    </span>
                  ) : null}
                  {commerceEmailPatchError ? (
                    <span className="mt-1 block text-[11px] leading-snug text-red-600">{commerceEmailPatchError}</span>
                  ) : null}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                disabled={commerceEmailColumnMissing || commerceEmailBusy}
                aria-checked={commerceEmailOn}
                onClick={() => {
                  if (commerceEmailColumnMissing || commerceEmailBusy) return;
                  const next = !commerceEmailOn;
                  setCommerceEmailBusy(true);
                  setCommerceEmailPatchError(null);
                  void (async () => {
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
                        setCommerceEmailPatchError(null);
                      } else if (j?.error === "column_missing") {
                        setCommerceEmailColumnMissing(true);
                      } else if (j?.error === "profile_not_found") {
                        setCommerceEmailPatchError(t("notifications_profile_missing"));
                      } else if (j?.error === "server_error") {
                        setCommerceEmailPatchError(t("notifications_save_failed"));
                      } else {
                        setCommerceEmailPatchError(
                          typeof j?.error === "string" ? j.error : t("notifications_save_failed")
                        );
                      }
                    } finally {
                      setCommerceEmailBusy(false);
                    }
                  })();
                }}
                className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                  commerceEmailOn ? "bg-signature" : "bg-sam-border-soft"
                }`}
              >
                <span
                  className={`inline-block h-6 w-6 rounded-full bg-sam-surface shadow transition-transform ${
                    commerceEmailOn ? "translate-x-6" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
          </div>
        ) : null}
        {domainLoaded ? (
          <>
            <div className="border-b border-sam-border-soft px-3 py-2.5">
              <p className="mb-2 text-[11px] leading-snug text-sam-muted">
                인앱 알림 (거래/커뮤니티/주문/매장) — 채팅방을 보고 있을 때는 같은 방 알림음이 울리지 않습니다.
              </p>
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-medium text-sam-fg">인앱 알림음</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={domainSoundOn}
                  onClick={() => {
                    const next = !domainSoundOn;
                    setDomainSoundOn(next);
                    void patchDomain({ sound_enabled: next });
                  }}
                  className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
                    domainSoundOn ? "bg-signature" : "bg-sam-border-soft"
                  }`}
                >
                  <span
                    className={`inline-block h-6 w-6 rounded-full bg-sam-surface shadow transition-transform ${
                      domainSoundOn ? "translate-x-6" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>
            </div>
            <div className="border-b border-sam-border-soft px-3 py-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-medium text-sam-fg">거래 채팅 알림</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={domainTradeChatOn}
                  onClick={() => {
                    const next = !domainTradeChatOn;
                    setDomainTradeChatOn(next);
                    void patchDomain({ trade_chat_enabled: next });
                  }}
                  className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
                    domainTradeChatOn ? "bg-signature" : "bg-sam-border-soft"
                  }`}
                >
                  <span
                    className={`inline-block h-6 w-6 rounded-full bg-sam-surface shadow transition-transform ${
                      domainTradeChatOn ? "translate-x-6" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>
            </div>
            <div className="border-b border-sam-border-soft px-3 py-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-medium text-sam-fg">커뮤니티·모임 채팅</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={domainCommunityChatOn}
                  onClick={() => {
                    const next = !domainCommunityChatOn;
                    setDomainCommunityChatOn(next);
                    void patchDomain({ community_chat_enabled: next });
                  }}
                  className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
                    domainCommunityChatOn ? "bg-signature" : "bg-sam-border-soft"
                  }`}
                >
                  <span
                    className={`inline-block h-6 w-6 rounded-full bg-sam-surface shadow transition-transform ${
                      domainCommunityChatOn ? "translate-x-6" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>
            </div>
            <div className="border-b border-sam-border-soft px-3 py-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-medium text-sam-fg">주문·배달 알림</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={domainOrderOn}
                  onClick={() => {
                    const next = !domainOrderOn;
                    setDomainOrderOn(next);
                    void patchDomain({ order_enabled: next });
                  }}
                  className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
                    domainOrderOn ? "bg-signature" : "bg-sam-border-soft"
                  }`}
                >
                  <span
                    className={`inline-block h-6 w-6 rounded-full bg-sam-surface shadow transition-transform ${
                      domainOrderOn ? "translate-x-6" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>
            </div>
            <div className="border-b border-sam-border-soft px-3 py-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-medium text-sam-fg">매장·상점 알림</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={domainStoreOn}
                  onClick={() => {
                    const next = !domainStoreOn;
                    setDomainStoreOn(next);
                    void patchDomain({ store_enabled: next });
                  }}
                  className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
                    domainStoreOn ? "bg-signature" : "bg-sam-border-soft"
                  }`}
                >
                  <span
                    className={`inline-block h-6 w-6 rounded-full bg-sam-surface shadow transition-transform ${
                      domainStoreOn ? "translate-x-6" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>
            </div>
            <div className="border-b border-sam-border-soft px-3 py-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-medium text-sam-fg">진동 (지원 기기)</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={domainVibrationOn}
                  onClick={() => {
                    const next = !domainVibrationOn;
                    setDomainVibrationOn(next);
                    void patchDomain({ vibration_enabled: next });
                  }}
                  className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
                    domainVibrationOn ? "bg-signature" : "bg-sam-border-soft"
                  }`}
                >
                  <span
                    className={`inline-block h-6 w-6 rounded-full bg-sam-surface shadow transition-transform ${
                      domainVibrationOn ? "translate-x-6" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>
            </div>
          </>
        ) : null}
      </SettingsSection>
      <SettingsSection title={t("notifications_dnd")} titleClassName="!text-[12px] !font-semibold">
        <div className="space-y-3 px-3 py-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-medium text-sam-fg">{t("notifications_use")}</span>
            <button
              type="button"
              role="switch"
              aria-checked={settings.do_not_disturb_enabled ?? false}
              onClick={() => update({ do_not_disturb_enabled: !(settings.do_not_disturb_enabled ?? false) })}
              className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
                settings.do_not_disturb_enabled ? "bg-signature" : "bg-sam-border-soft"
              }`}
            >
              <span
                className={`inline-block h-6 w-6 rounded-full bg-sam-surface shadow transition-transform ${
                  settings.do_not_disturb_enabled ? "translate-x-6" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
          {(settings.do_not_disturb_enabled ?? false) && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="time"
                value={settings.do_not_disturb_start ?? "22:00"}
                onChange={(e) => update({ do_not_disturb_start: e.target.value })}
                className="rounded border border-sam-border px-2.5 py-1.5 text-[13px]"
              />
              <span className="text-sam-muted">~</span>
              <input
                type="time"
                value={settings.do_not_disturb_end ?? "08:00"}
                onChange={(e) => update({ do_not_disturb_end: e.target.value })}
                className="rounded border border-sam-border px-2.5 py-1.5 text-[13px]"
              />
            </div>
          )}
        </div>
      </SettingsSection>
    </div>
  );
}
