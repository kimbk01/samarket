"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import {
  getUserSettings,
  subscribeUserSettings,
  syncUserSettings,
  updateUserSettings,
} from "@/lib/settings/user-settings-store";
import { MyToggle } from "@/components/mypage/ds/MyToggle";
import { MyStateView } from "@/components/mypage/ds/MyStateView";
import { showMypageToast } from "@/lib/mypage/mypage-toast";
import { Sam } from "@/lib/ui/sam-component-classes";

type TradePresenceSettings = {
  showOnline: boolean;
  hideLastSeen: boolean;
  audience: "everyone" | "friends" | "nobody";
};

export function ChatSettingsContent() {
  const { t } = useI18n();
  const userId = getCurrentUser()?.id ?? "me";
  const [settings, setSettings] = useState(() => getUserSettings(userId));
  const [tradePresence, setTradePresence] = useState<TradePresenceSettings | null>(null);
  const [tradePresenceErr, setTradePresenceErr] = useState<string | null>(null);
  const [tradePresenceSaving, setTradePresenceSaving] = useState(false);
  const [tradePresenceReloadKey, setTradePresenceReloadKey] = useState(0);

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
        const r = await runSingleFlight("me:trade-presence:get", () =>
          fetch("/api/me/trade-presence", { credentials: "include" })
        );
        const j = (await r
          .clone()
          .json()
          .catch(() => ({}))) as {
          ok?: boolean;
          settings?: {
            showOnline?: boolean;
            hideLastSeen?: boolean;
            audience?: string;
          };
        };
        if (cancelled) return;
        // HTTP 실패·ok 누락·settings 누락 모두 오류 처리 (로딩 문구에 갇히지 않게)
        if (!r.ok || j.ok !== true || !j.settings) {
          setTradePresenceErr(t("settings_trade_presence_load_failed"));
          return;
        }
        setTradePresenceErr((prev) => (prev === null ? prev : null));
        const a = j.settings.audience;
        const audience = a === "everyone" || a === "friends" || a === "nobody" ? a : "friends";
        setTradePresence({
          showOnline: j.settings.showOnline !== false,
          hideLastSeen: j.settings.hideLastSeen === true,
          audience,
        });
      } catch {
        if (!cancelled) setTradePresenceErr(t("settings_trade_presence_load_failed"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, t, tradePresenceReloadKey]);

  /** 채팅 푸시·미리보기 — `user_settings` 저장(실패 시 스토어가 되돌림 + 토스트) */
  const toggle = (key: "chat_push_enabled" | "chat_preview_enabled", next: boolean) =>
    updateUserSettings(userId, { [key]: next });

  /** 거래 접속 상태 — 낙관 반영 → PATCH → 실패 시 이전 값 복귀 + 토스트(S16 오류 표시 통일) */
  const patchTradePresence = async (partial: Partial<TradePresenceSettings>): Promise<boolean> => {
    if (!tradePresence) return false;
    const prev = tradePresence;
    const next: TradePresenceSettings = { ...prev, ...partial };
    setTradePresence(next);
    setTradePresenceSaving((prev) => (prev ? prev : true));
    setTradePresenceErr((prev) => (prev === null ? prev : null));
    const body: Record<string, unknown> = {};
    if (partial.showOnline !== undefined) body.showOnline = partial.showOnline;
    if (partial.hideLastSeen !== undefined) body.hideLastSeen = partial.hideLastSeen;
    if (partial.audience !== undefined) body.audience = partial.audience;
    try {
      const r = await fetch("/api/me/trade-presence", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) {
        setTradePresence(prev);
        return false;
      }
      return true;
    } catch {
      setTradePresence(prev);
      return false;
    } finally {
      setTradePresenceSaving((prev) => (prev ? false : prev));
    }
  };

  const rowClass = "flex min-h-[52px] items-center justify-between gap-3 border-b border-sam-border-soft py-3";

  return (
    <div className="space-y-0" data-testid="chat-settings">
      <div className={rowClass}>
        <span className="sam-text-body text-sam-fg">{t("settings_chat_push")}</span>
        <MyToggle
          checked={settings.chat_push_enabled !== false}
          ariaLabel={t("settings_chat_push")}
          onChange={(next) => toggle("chat_push_enabled", next)}
        />
      </div>
      <div className={rowClass}>
        <span className="sam-text-body text-sam-fg">{t("settings_chat_preview")}</span>
        <MyToggle
          checked={settings.chat_preview_enabled !== false}
          ariaLabel={t("settings_chat_preview")}
          onChange={(next) => toggle("chat_preview_enabled", next)}
        />
      </div>

      <div className="border-b border-sam-border-soft py-3">
        <p className="sam-text-body font-semibold text-sam-fg">{t("settings_trade_presence_title")}</p>
        <p className="mt-1 sam-text-helper leading-relaxed text-sam-muted">{t("settings_trade_presence_desc")}</p>
        {tradePresenceErr && !tradePresence ? (
          <MyStateView
            kind="error"
            template="settings"
            error={{
              message: tradePresenceErr,
              onRetry: () => {
                setTradePresenceErr(null);
                setTradePresenceReloadKey((k) => k + 1);
              },
            }}
          />
        ) : null}
        {tradePresence ? (
          <div className="mt-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="sam-text-body text-sam-fg">{t("settings_trade_presence_online")}</span>
              <MyToggle
                checked={tradePresence.showOnline}
                disabled={tradePresenceSaving}
                ariaLabel={t("settings_trade_presence_online")}
                onChange={(next) => patchTradePresence({ showOnline: next })}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="sam-text-body text-sam-fg">{t("settings_trade_presence_hide_last_seen")}</span>
              <MyToggle
                checked={tradePresence.hideLastSeen}
                disabled={tradePresenceSaving}
                ariaLabel={t("settings_trade_presence_hide_last_seen")}
                onChange={(next) => patchTradePresence({ hideLastSeen: next })}
              />
            </div>
            <div>
              <span className="sam-text-body text-sam-fg">{t("settings_trade_presence_audience")}</span>
              <p className="mt-0.5 sam-text-xxs text-sam-muted">{t("settings_trade_presence_audience_hint")}</p>
              <select
                className={`${Sam.input.select} ${Sam.focusRing} mt-2 w-full rounded-ui-rect text-[16px]`}
                disabled={tradePresenceSaving}
                value={tradePresence.audience}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "everyone" || v === "friends" || v === "nobody") {
                    void patchTradePresence({ audience: v }).then((ok) => {
                      if (!ok) showMypageToast(t("settings_trade_presence_save_failed"), "error");
                    });
                  }
                }}
              >
                <option value="everyone">{t("settings_trade_presence_audience_everyone")}</option>
                <option value="friends">{t("settings_trade_presence_audience_friends")}</option>
                <option value="nobody">{t("settings_trade_presence_audience_nobody")}</option>
              </select>
            </div>
          </div>
        ) : tradePresenceErr ? null : (
          <div className="mt-3" data-testid="trade-presence-skeleton">
            <MyStateView
              kind="loading"
              template="settings"
              rowLabels={[t("settings_trade_presence_online"), t("settings_trade_presence_hide_last_seen")]}
            />
          </div>
        )}
      </div>
    </div>
  );
}
