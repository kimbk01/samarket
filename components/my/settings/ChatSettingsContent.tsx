"use client";

import { useCallback, useEffect, useState } from "react";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import {
  getUserSettings,
  subscribeUserSettings,
  syncUserSettings,
  updateUserSettings,
} from "@/lib/settings/user-settings-store";

type TradePresenceSettings = {
  showOnline: boolean;
  hideLastSeen: boolean;
  audience: "everyone" | "friends" | "nobody";
};

export function ChatSettingsContent() {
  const userId = getCurrentUser()?.id ?? "me";
  const [settings, setSettings] = useState(() => getUserSettings(userId));
  const [tradePresence, setTradePresence] = useState<TradePresenceSettings | null>(null);
  const [tradePresenceErr, setTradePresenceErr] = useState<string | null>(null);
  const [tradePresenceSaving, setTradePresenceSaving] = useState(false);

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
        const j = (await r.json()) as {
          ok?: boolean;
          settings?: {
            showOnline?: boolean;
            hideLastSeen?: boolean;
            audience?: string;
          };
        };
        if (cancelled || !j.ok || !j.settings) {
          if (!cancelled && j.ok === false) setTradePresenceErr("거래 채팅 표시 설정을 불러오지 못했습니다.");
          return;
        }
        setTradePresenceErr(null);
        const a = j.settings.audience;
        const audience = a === "everyone" || a === "friends" || a === "nobody" ? a : "friends";
        setTradePresence({
          showOnline: j.settings.showOnline !== false,
          hideLastSeen: j.settings.hideLastSeen === true,
          audience,
        });
      } catch {
        if (!cancelled) setTradePresenceErr("거래 채팅 표시 설정을 불러오지 못했습니다.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const toggle = (key: "chat_push_enabled" | "chat_preview_enabled") => {
    const v = settings[key];
    updateUserSettings(userId, { [key]: !(v ?? true) });
    refresh();
  };

  const patchTradePresence = async (partial: Partial<TradePresenceSettings>) => {
    if (!tradePresence) return;
    const prev = tradePresence;
    const next: TradePresenceSettings = { ...prev, ...partial };
    setTradePresence(next);
    setTradePresenceSaving(true);
    setTradePresenceErr(null);
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
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) {
        setTradePresence(prev);
        setTradePresenceErr(j.error ?? "저장에 실패했습니다.");
      }
    } catch {
      setTradePresence(prev);
      setTradePresenceErr("네트워크 오류로 저장하지 못했습니다.");
    } finally {
      setTradePresenceSaving(false);
    }
  };

  return (
    <div className="space-y-0">
      <div className="flex items-center justify-between border-b border-sam-border-soft py-3">
        <span className="sam-text-body text-sam-fg">채팅 알림</span>
        <button
          type="button"
          role="switch"
          aria-checked={settings.chat_push_enabled !== false}
          onClick={() => toggle("chat_push_enabled")}
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
      <div className="flex items-center justify-between border-b border-sam-border-soft py-3">
        <span className="sam-text-body text-sam-fg">미리보기 표시</span>
        <button
          type="button"
          role="switch"
          aria-checked={settings.chat_preview_enabled !== false}
          onClick={() => toggle("chat_preview_enabled")}
          className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
            settings.chat_preview_enabled !== false ? "bg-signature" : "bg-sam-border-soft"
          }`}
        >
          <span
            className={`inline-block h-6 w-6 rounded-full bg-sam-surface shadow transition-transform ${
              settings.chat_preview_enabled !== false ? "translate-x-6" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      <div className="border-b border-sam-border-soft py-3">
        <p className="sam-text-body font-semibold text-sam-fg">거래 채팅 표시</p>
        <p className="mt-1 sam-text-helper leading-relaxed text-sam-muted">
          온라인·자리비움은 연결과 최근 활동으로만 표시됩니다. 마지막 접속은 앱을 닫거나 오래 비활성일 때 갱신됩니다.
        </p>
        {tradePresenceErr ? <p className="mt-2 sam-text-helper text-red-600">{tradePresenceErr}</p> : null}
        {tradePresence ? (
          <div className="mt-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="sam-text-body text-sam-fg">온라인 표시</span>
              <button
                type="button"
                role="switch"
                aria-checked={tradePresence.showOnline}
                disabled={tradePresenceSaving}
                onClick={() => void patchTradePresence({ showOnline: !tradePresence.showOnline })}
                className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
                  tradePresence.showOnline ? "bg-signature" : "bg-sam-border-soft"
                }`}
              >
                <span
                  className={`inline-block h-6 w-6 rounded-full bg-sam-surface shadow transition-transform ${
                    tradePresence.showOnline ? "translate-x-6" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="sam-text-body text-sam-fg">마지막 접속 숨기기</span>
              <button
                type="button"
                role="switch"
                aria-checked={tradePresence.hideLastSeen}
                disabled={tradePresenceSaving}
                onClick={() => void patchTradePresence({ hideLastSeen: !tradePresence.hideLastSeen })}
                className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
                  tradePresence.hideLastSeen ? "bg-signature" : "bg-sam-border-soft"
                }`}
              >
                <span
                  className={`inline-block h-6 w-6 rounded-full bg-sam-surface shadow transition-transform ${
                    tradePresence.hideLastSeen ? "translate-x-6" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
            <div>
              <span className="sam-text-body text-sam-fg">상태 공개 범위</span>
              <p className="mt-0.5 sam-text-xxs text-sam-muted">
                「거래 상대만」은 같은 거래 채팅방에서만 온라인 표시가 공유됩니다.
              </p>
              <select
                className="mt-2 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
                disabled={tradePresenceSaving}
                value={tradePresence.audience}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "everyone" || v === "friends" || v === "nobody") {
                    void patchTradePresence({ audience: v });
                  }
                }}
              >
                <option value="everyone">모두에게 공개</option>
                <option value="friends">거래 상대만</option>
                <option value="nobody">나만 보기</option>
              </select>
            </div>
          </div>
        ) : tradePresenceErr ? null : (
          <p className="mt-2 sam-text-helper text-sam-muted">설정을 불러오는 중…</p>
        )}
      </div>
    </div>
  );
}
