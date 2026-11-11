"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyToggle } from "@/components/mypage/ds/MyToggle";
import { MyStateView } from "@/components/mypage/ds/MyStateView";

type DiscoverySettings = { allowIdSearch: boolean; allowQrAdd: boolean };

/**
 * 친구 찾기 설정 (설계안 v3 §3.7 · 시안 H) — 아이디 검색 허용 · QR 친구 추가 허용.
 * 저장은 `MyToggle` 계약(낙관 표시 → PATCH → 실패 시 원위치 + 토스트).
 */
export function MemberDiscoverySettingsSection() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<DiscoverySettings | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch("/api/me/discovery-settings", { credentials: "include" });
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean; settings?: DiscoverySettings };
        if (cancelled) return;
        if (!r.ok || j.ok !== true || !j.settings) {
          setLoadFailed(true);
          return;
        }
        setLoadFailed(false);
        setSettings(j.settings);
      } catch {
        if (!cancelled) setLoadFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  /** 저장 — 낙관 표시·실패 시 원위치·토스트는 `MyToggle` 계약이 맡는다 */
  const patch = async (partial: Partial<DiscoverySettings>): Promise<boolean> => {
    try {
      const r = await fetch("/api/me/discovery-settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partial),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; settings?: DiscoverySettings };
      if (!r.ok || j.ok !== true || !j.settings) return false;
      setSettings(j.settings);
      return true;
    } catch {
      return false;
    }
  };

  return (
    <div className="border-b border-sam-border-soft py-3" data-testid="member-discovery-settings">
      <p className="sam-text-body font-semibold text-sam-fg">{t("member_discovery_title")}</p>
      {loadFailed && !settings ? (
        <MyStateView
          kind="error"
          template="settings"
          error={{
            message: t("member_discovery_load_failed"),
            onRetry: () => {
              setLoadFailed(false);
              setReloadKey((k) => k + 1);
            },
          }}
        />
      ) : settings ? (
        <div className="mt-3 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="sam-text-body text-sam-fg">{t("member_discovery_allow_id_search")}</span>
              <p className="mt-0.5 sam-text-xxs text-sam-muted">{t("member_discovery_allow_id_search_desc")}</p>
            </div>
            <MyToggle
              checked={settings.allowIdSearch}
              ariaLabel={t("member_discovery_allow_id_search")}
              onChange={(next) => patch({ allowIdSearch: next })}
            />
          </div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="sam-text-body text-sam-fg">{t("member_discovery_allow_qr_add")}</span>
              <p className="mt-0.5 sam-text-xxs text-sam-muted">{t("member_discovery_allow_qr_add_desc")}</p>
            </div>
            <MyToggle
              checked={settings.allowQrAdd}
              ariaLabel={t("member_discovery_allow_qr_add")}
              onChange={(next) => patch({ allowQrAdd: next })}
            />
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <MyStateView
            kind="loading"
            template="settings"
            rowLabels={[t("member_discovery_allow_id_search"), t("member_discovery_allow_qr_add")]}
          />
        </div>
      )}
    </div>
  );
}
