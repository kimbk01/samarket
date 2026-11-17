"use client";

/**
 * 앱 진입 어드민 v3 §5 (Owner 2026-11-17 「v3대로 진행」) — 「첫 진입 화면」 칸.
 * OS 시작 화면과 한 화면(`OsLaunchAdminPage` 오른쪽)에 들어간다. 옛 주소 /admin/settings/startup-config 는 그 화면으로 이동.
 *
 * 값 = 앱 `initialSurface`(admin_settings `startup_config_v1`) 6종 — 저장은 기존 API(PUT /api/admin/startup-config, settings 키).
 * 화면은 저장값을 보여 주고 고르기만 한다. 앱이 그 값을 어떻게 쓰는지는 앱 쪽 단일 정의가 정한다.
 */

import { useCallback, useEffect, useState } from "react";
import { AdminCard } from "@/components/admin/AdminCard";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  BUNDLED_STARTUP_CONFIG,
  normalizeStartupConfig,
  type StartupConfig,
} from "@/lib/startup/startup-config";
import {
  INITIAL_APP_SURFACES,
  pathForInitialAppSurface,
  type InitialAppSurface,
} from "@/lib/startup/initial-app-surface";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminListItemButton } from "@/components/admin/ui/AdminListItemButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { useAdminRouteAction } from "@/components/admin/access/use-admin-route-access";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import {
  AdminErrorState,
  AdminLoadingState,
  AdminResultBanner,
} from "@/components/admin/ui/AdminStateViews";
import { adminSafeErrorCode, type AdminLoadFailure } from "@/lib/admin/admin-load-failure";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import {
  APP_ENTRY_MEMBERS_ONLY_SURFACES,
  APP_ENTRY_SURFACE_LABEL_KEY,
} from "@/lib/admin/app-entry/app-entry-surface-labels";
import type { StartupConfigLastChange } from "@/lib/admin/app-entry/overview-types";

type ApiOk = { ok: true; config?: unknown; source?: "db" | "default"; lastChange?: StartupConfigLastChange };
type ApiErr = { ok?: false; error?: string };

export function FirstEntrySurfaceCard() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [saved, setSaved] = useState<StartupConfig>(() => ({ ...BUNDLED_STARTUP_CONFIG }));
  const [draft, setDraft] = useState<InitialAppSurface>(BUNDLED_STARTUP_CONFIG.initialSurface);
  const [source, setSource] = useState<"db" | "default">("default");
  const [lastChange, setLastChange] = useState<StartupConfigLastChange | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  /** G-18: 첫 진입 화면 저장(startup-config PUT) = settings 키 (접근표 action — API 403 과 같은 판정) */
  const adminAction = useAdminRouteAction("/admin/settings/startup-config");
  const [result, setResult] = useState<{ ok: true; message: string } | { ok: false; code: string } | null>(null);
  const [loadErr, setLoadErr] = useState<AdminLoadFailure | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const apply = useCallback((json: ApiOk) => {
    const cfg = normalizeStartupConfig(json.config);
    setSaved(cfg);
    setDraft(cfg.initialSurface);
    if (json.source) setSource(json.source);
    setLastChange(json.lastChange ?? null);
  }, []);

  /** 조회 실패를 번들 기본값으로 숨기지 않는다 — 오류 상태 + [새로고침] (R6). */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/startup-config", { credentials: "same-origin" });
        const json = (await res.json().catch(() => ({}))) as ApiOk | ApiErr;
        if (cancelled) return;
        if (res.ok && json.ok) {
          setLoadErr(null);
          apply(json);
        } else {
          setLoadErr({ code: adminSafeErrorCode(json.ok ? undefined : json.error, "load_failed"), httpStatus: res.status });
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
  }, [apply, reloadKey]);

  const reload = useCallback(() => {
    setLoading(true);
    setLoadErr(null);
    setReloadKey((k) => k + 1);
  }, []);

  const save = useCallback(async () => {
    // 설정 저장 = L1 확인 (표준 확인창)
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("save"),
      ko,
      title: t("admin_app_entry_first_title"),
      description: t("admin_app_entry_first_save_confirm", { surface: t(APP_ENTRY_SURFACE_LABEL_KEY[draft]) }),
      confirmLabel: adminCta("save", ko),
    });
    if (!confirmed.ok) return;
    setSaving(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/startup-config", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: { ...saved, initialSurface: draft } }),
      });
      const json = (await res.json().catch(() => ({}))) as ApiOk | ApiErr;
      if (!res.ok || !json.ok) {
        setResult({ ok: false, code: res.status === 403 ? "forbidden" : adminSafeErrorCode(json.ok ? undefined : json.error, "save_failed") });
        return;
      }
      apply({ ...json, source: "db" });
      setResult({ ok: true, message: t("admin_app_entry_first_saved") });
    } catch {
      setResult({ ok: false, code: "network_error" });
    } finally {
      setSaving(false);
    }
  }, [apply, draft, ko, saved, t]);

  const lastChangeText = (() => {
    if (source === "default" || !lastChange?.at) return t("admin_app_entry_first_never_saved");
    const time = formatAdminManilaDateTime(lastChange.at);
    return lastChange.actorLabel
      ? t("admin_app_entry_first_last_change", { time, actor: lastChange.actorLabel })
      : t("admin_app_entry_first_last_change_no_actor", { time });
  })();

  return (
    <AdminCard>
      <div className="space-y-3" data-app-entry-first-entry="1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="sam-text-title font-semibold text-sam-fg">{t("admin_app_entry_first_title")}</h2>
          <AdminToneBadge tone="success">{t("admin_app_entry_first_badge")}</AdminToneBadge>
        </div>
        <p className="sam-text-body text-sam-fg">{t("admin_app_entry_first_lead")}</p>
        {loading ? (
          <AdminLoadingState ko={ko} />
        ) : loadErr ? (
          <AdminErrorState ko={ko} code={loadErr.code} httpStatus={loadErr.httpStatus} onRetry={reload} />
        ) : (
          <>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label={t("admin_app_entry_first_title")}>
              {INITIAL_APP_SURFACES.map((surface) => {
                const selected = draft === surface;
                return (
                  <li key={surface}>
                    <AdminListItemButton
                      selected={selected}
                      role="radio"
                      aria-checked={selected}
                      data-app-entry-surface={surface}
                      disabled={saving || !adminAction.allowed}
                      className="h-full border border-sam-border text-center"
                      onClick={() => setDraft(surface)}
                    >
                      <span className="block sam-text-body font-semibold text-sam-fg">{t(APP_ENTRY_SURFACE_LABEL_KEY[surface])}</span>
                      <span className="block text-[12px] text-sam-muted">
                        {APP_ENTRY_MEMBERS_ONLY_SURFACES.has(surface)
                          ? t("admin_app_entry_first_members_only")
                          : pathForInitialAppSurface(surface)}
                      </span>
                    </AdminListItemButton>
                  </li>
                );
              })}
            </ul>
            <ul className="list-disc space-y-1 rounded-ui-rect border border-sam-border-soft bg-sam-surface-muted py-2 pl-7 pr-3 text-[13px] text-sam-fg">
              <li>{t("admin_app_entry_first_rule_link")}</li>
              <li>{t("admin_app_entry_first_rule_restore")}</li>
              <li>{t("admin_app_entry_first_rule_next_launch")}</li>
              <li>
                {t("admin_app_entry_first_current", { surface: t(APP_ENTRY_SURFACE_LABEL_KEY[saved.initialSurface]) })} ·{" "}
                {lastChangeText}
              </li>
            </ul>
            <div className="flex flex-wrap items-center gap-2">
              <AdminActionButton
                variant="primary"
                type="button"
                disabled={saving || !adminAction.allowed || draft === saved.initialSurface}
                title={adminAction.reason ?? undefined}
                onClick={() => void save()}
              >
                {saving ? t("common_loading") : adminCta("save", ko)}
              </AdminActionButton>
              {!adminAction.allowed && adminAction.reason ? (
                <span className="text-[13px] text-sam-muted" data-admin-action-denied="1">
                  {adminAction.reason}
                </span>
              ) : null}
            </div>
            {result ? <AdminResultBanner ko={ko} result={result} onClose={() => setResult(null)} /> : null}
          </>
        )}
      </div>
    </AdminCard>
  );
}
