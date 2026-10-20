"use client";

/**
 * Admin cold-start tab — initialSurface only.
 * Authored Product Intro is removed. Boot branding is OS/native, not this page.
 */

import { useCallback, useEffect, useState } from "react";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  BUNDLED_STARTUP_CONFIG,
  normalizeStartupConfig,
  type StartupConfig,
} from "@/lib/startup/startup-config";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import {
  AdminErrorState,
  AdminLoadingState,
  AdminResultBanner,
} from "@/components/admin/ui/AdminStateViews";
import { adminSafeErrorCode, type AdminLoadFailure } from "@/lib/admin/admin-load-failure";

export function StartupConfigAdminPage() {
  const { safeT, language } = useI18n();
  const ko = language !== "en";
  const [draft, setDraft] = useState<StartupConfig>(() => ({
    ...BUNDLED_STARTUP_CONFIG,
  }));
  const [loading, setLoading] = useState(true);
  const [savingTab, setSavingTab] = useState(false);
  const [tabResult, setTabResult] = useState<{ ok: true; message: string } | { ok: false; code: string } | null>(
    null
  );
  const [loadErr, setLoadErr] = useState<AdminLoadFailure | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  /** 조회 실패를 번들 기본값으로 숨기지 않는다 — 오류 상태 + [새로고침] (R6). */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/startup-config", { credentials: "same-origin" });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; config?: unknown; error?: string };
        if (cancelled) return;
        if (res.ok && json?.ok) {
          setLoadErr(null);
          setDraft(normalizeStartupConfig(json.config));
        } else {
          setLoadErr({ code: adminSafeErrorCode(json?.error, "load_failed"), httpStatus: res.status });
        }
      } catch {
        if (!cancelled) setLoadErr({ code: "network_error" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const reload = useCallback(() => {
    setLoading(true);
    setLoadErr(null);
    setReloadKey((k) => k + 1);
  }, []);

  const saveInitialTab = useCallback(async () => {
    setSavingTab(true);
    setTabResult(null);
    try {
      const res = await fetch("/api/admin/startup-config", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: draft }),
      });
      const json = (await res.json()) as { ok?: boolean; config?: unknown; error?: string };
      if (!res.ok || !json.ok) {
        setTabResult({ ok: false, code: res.status === 403 ? "forbidden" : adminSafeErrorCode(json.error, "save_failed") });
        return;
      }
      setDraft(normalizeStartupConfig(json.config));
      setTabResult({
        ok: true,
        message: safeT("admin_startup_config_save_ok", {
          fallbackKo: "저장되었습니다.",
          fallbackEn: "Saved.",
        }),
      });
    } catch {
      setTabResult({ ok: false, code: "network_error" });
    } finally {
      setSavingTab(false);
    }
  }, [draft, safeT]);

  return (
    <div className="space-y-4">
      <AdminPageHeader
        titleKey="admin_menu_settings_startup_config"
        description={safeT("admin_startup_config_desc", {
          fallbackKo: "앱을 열었을 때 기본으로 들어갈 하단 탭을 설정합니다.",
          fallbackEn: "Choose the default bottom tab when the app opens.",
        })}
      />

      <AdminCard>
        <h2 className="mb-1 sam-text-title font-semibold text-sam-fg">
          {safeT("admin_startup_config_section_surface", {
            fallbackKo: "앱 시작 탭",
            fallbackEn: "Launch tab",
          })}
        </h2>
        <p className="mb-4 sam-text-body text-sam-muted">
          {safeT("admin_startup_config_initial_surface_hint", {
            fallbackKo: "앱을 열었을 때 기본으로 열릴 하단 탭입니다.",
            fallbackEn: "Default bottom tab when the app opens.",
          })}
        </p>
        {loading ? (
          <AdminLoadingState ko={ko} />
        ) : loadErr ? (
          <AdminErrorState ko={ko} code={loadErr.code} httpStatus={loadErr.httpStatus} onRetry={reload} />
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
            <AdminActionButton
              variant="secondary"
              type="button"
              disabled={savingTab}
              onClick={() => void saveInitialTab()}
            >
              {savingTab
                ? safeT("common_loading", { fallbackKo: "저장 중…", fallbackEn: "Saving…" })
                : safeT("admin_first_entry_save_tab", {
                    fallbackKo: "시작 탭 저장",
                    fallbackEn: "Save launch tab",
                  })}
            </AdminActionButton>
          </div>
        )}
        {!loading && !loadErr && tabResult ? (
          <div className="mt-3">
            <AdminResultBanner ko={ko} result={tabResult} onClose={() => setTabResult(null)} />
          </div>
        ) : null}
      </AdminCard>
    </div>
  );
}
