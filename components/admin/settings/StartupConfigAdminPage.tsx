"use client";

/**
 * Admin first-entry page — ONE operational editor.
 * Product Intro (startup_product_intro_v1) is the operator-facing first-entry authority.
 * startup_config_v1 Technical Boot branding is NOT exposed (INTERNAL fallback only).
 * Optional: cold-start BottomNav tab via initialSurface (not a second intro image).
 */

import { useCallback, useEffect, useState } from "react";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ProductIntroAdminSection } from "@/components/admin/settings/ProductIntroAdminSection";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  BUNDLED_STARTUP_CONFIG,
  normalizeStartupConfig,
  type StartupConfig,
} from "@/lib/startup/startup-config";

export function StartupConfigAdminPage() {
  const { safeT, t } = useI18n();
  const [draft, setDraft] = useState<StartupConfig>(() => ({
    ...BUNDLED_STARTUP_CONFIG,
  }));
  const [loading, setLoading] = useState(true);
  const [savingTab, setSavingTab] = useState(false);
  const [tabMessage, setTabMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/startup-config", { credentials: "same-origin" });
        const json = (await res.json()) as { ok?: boolean; config?: unknown };
        if (!cancelled && json?.ok) {
          setDraft(normalizeStartupConfig(json.config));
        }
      } catch {
        /* keep bundled */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const saveInitialTab = useCallback(async () => {
    setSavingTab(true);
    setTabMessage(null);
    try {
      const res = await fetch("/api/admin/startup-config", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: draft }),
      });
      const json = (await res.json()) as { ok?: boolean; config?: unknown; error?: string };
      if (!res.ok || !json.ok) {
        setTabMessage(json.error ?? "save_failed");
        return;
      }
      setDraft(normalizeStartupConfig(json.config));
      setTabMessage(
        safeT("admin_startup_config_save_ok", {
          fallbackKo: "저장되었습니다.",
          fallbackEn: "Saved.",
        })
      );
    } catch {
      setTabMessage("save_failed");
    } finally {
      setSavingTab(false);
    }
  }, [draft, safeT]);

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={safeT("admin_startup_config_title", {
          fallbackKo: "앱 첫 진입 화면",
          fallbackEn: "App first-entry screen",
        })}
        description={safeT("admin_startup_config_desc", {
          fallbackKo: "앱을 실행할 때 처음 표시할 화면을 설정합니다.",
          fallbackEn: "Configure the screen shown when the app launches.",
        })}
      />

      <AdminCard>
        <ProductIntroAdminSection />
      </AdminCard>

      <AdminCard>
        <h2 className="mb-1 sam-text-title font-semibold text-sam-fg">
          {safeT("admin_startup_config_section_surface", {
            fallbackKo: "앱 시작 탭",
            fallbackEn: "Launch tab",
          })}
        </h2>
        <p className="mb-4 sam-text-body text-sam-muted">
          {safeT("admin_startup_config_initial_surface_hint", {
            fallbackKo:
              "첫 진입 화면 이후(또는 사용 안 함일 때) 기본으로 열릴 하단 탭입니다. 첫 진입 이미지와는 별개입니다.",
            fallbackEn:
              "Default bottom tab after the first-entry screen (or immediately when it is off). Not a second intro image.",
          })}
        </p>
        {loading ? (
          <p className="sam-text-body text-sam-muted">{t("common_loading")}</p>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1">
              <label className="mb-1 block sam-text-body font-medium text-sam-fg">
                {safeT("admin_startup_config_initial_surface", {
                  fallbackKo: "시작 탭",
                  fallbackEn: "Launch tab",
                })}
              </label>
              <select
                className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
                value={draft.initialSurface}
                onChange={(e) =>
                  setDraft((prev) =>
                    normalizeStartupConfig({
                      ...prev,
                      initialSurface: e.target.value as StartupConfig["initialSurface"],
                    })
                  )
                }
              >
                <option value="community">
                  {safeT("admin_startup_config_surface_community", {
                    fallbackKo: "커뮤니티",
                    fallbackEn: "Community",
                  })}
                </option>
                <option value="trade">
                  {safeT("admin_startup_config_surface_trade", {
                    fallbackKo: "거래",
                    fallbackEn: "Trade",
                  })}
                </option>
                <option value="food">
                  {safeT("admin_startup_config_surface_food", {
                    fallbackKo: "배달/푸드",
                    fallbackEn: "Food / Delivery",
                  })}
                </option>
                <option value="chat">
                  {safeT("admin_startup_config_surface_chat", {
                    fallbackKo: "채팅",
                    fallbackEn: "Chat",
                  })}
                </option>
                <option value="my">
                  {safeT("admin_startup_config_surface_my", {
                    fallbackKo: "내 정보",
                    fallbackEn: "My",
                  })}
                </option>
              </select>
            </div>
            <button
              type="button"
              className="sam-btn sam-btn-secondary"
              disabled={savingTab}
              onClick={() => void saveInitialTab()}
            >
              {savingTab
                ? safeT("common_loading", { fallbackKo: "저장 중…", fallbackEn: "Saving…" })
                : safeT("admin_first_entry_save_tab", {
                    fallbackKo: "시작 탭 저장",
                    fallbackEn: "Save launch tab",
                  })}
            </button>
            {tabMessage ? (
              <span className="sam-text-caption text-sam-muted">{tabMessage}</span>
            ) : null}
          </div>
        )}
      </AdminCard>
    </div>
  );
}
