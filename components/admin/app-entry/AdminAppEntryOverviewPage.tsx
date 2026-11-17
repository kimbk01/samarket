"use client";

/**
 * 앱 진입 어드민 v3 §B 「한눈에 보기」 (Owner 2026-11-17 「v3대로 진행」).
 * OS 시작 화면 → 첫 진입 화면 → 인트로 → 팝업 순서를 한 줄로 보여 주고, 칸마다 그 관리 화면으로 간다.
 * 값은 서버(`GET /api/admin/app-entry/overview`)가 앱이 받는 것과 같은 함수로 만든 것을 그대로 쓴다 — 화면에서 다시 계산하지 않는다.
 */

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import {
  AdminErrorState,
  AdminLoadingState,
} from "@/components/admin/ui/AdminStateViews";
import { adminSafeErrorCode, type AdminLoadFailure } from "@/lib/admin/admin-load-failure";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import type {
  AppEntryInstallBucket,
  AppEntryOverview,
} from "@/lib/admin/app-entry/overview-types";
import { APP_ENTRY_SURFACE_LABEL_KEY } from "@/lib/admin/app-entry/app-entry-surface-labels";
import type { MessageKey } from "@/lib/i18n/messages";

const SCENE_STATE_KEY: Record<string, MessageKey> = {
  active: "admin_app_entry_ov_scene_active",
  paused: "admin_app_entry_ov_scene_paused",
  unpublished: "admin_app_entry_ov_scene_unpublished",
};

function FailedLine({ code }: { code: string }) {
  const { t } = useI18n();
  return <p className="text-[13px] text-sam-danger">{t("admin_app_entry_ov_card_failed", { code })}</p>;
}

function StepCard({
  step,
  title,
  href,
  children,
  testId,
}: {
  step: number;
  title: string;
  href: string;
  children: ReactNode;
  testId: string;
}) {
  const { t } = useI18n();
  return (
    <li className="relative flex min-w-0" data-app-entry-step={testId}>
      <Link
        href={href}
        className="flex w-full flex-col gap-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4 hover:bg-sam-fg/5"
      >
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sam-primary text-[12px] font-semibold text-sam-on-primary">
            {step}
          </span>
          <span className="sam-text-body font-semibold text-sam-fg">{title}</span>
        </div>
        <div className="space-y-1 text-[13px] text-sam-fg">{children}</div>
        <p className="mt-auto text-[12px] font-medium text-sam-muted">{t("admin_go_to_management")}</p>
      </Link>
    </li>
  );
}

function InstallTable({ platform, rows }: { platform: string; rows: AppEntryInstallBucket[] }) {
  const { t } = useI18n();
  return (
    <div className="min-w-0">
      <h3 className="mb-1 sam-text-body font-semibold text-sam-fg">{platform}</h3>
      {rows.length === 0 ? (
        <p className="text-[13px] text-sam-muted">{t("admin_app_entry_ov_installs_empty")}</p>
      ) : (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-sam-border text-left text-sam-muted">
              <th className="py-1 font-medium">{t("admin_app_entry_ov_installs_col_version")}</th>
              <th className="py-1 text-right font-medium">{t("admin_app_entry_ov_installs_col_devices")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.version} className="border-b border-sam-border-soft">
                <td className="py-1 font-mono">
                  {r.version === "unknown" ? t("admin_app_entry_ov_installs_unknown_version") : r.version}
                </td>
                <td className="py-1 text-right tabular-nums">{formatAdminNumber(r.devices)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function AdminAppEntryOverviewPage() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [data, setData] = useState<AppEntryOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<AdminLoadFailure | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/app-entry/overview", { credentials: "same-origin" });
        const json = (await res.json().catch(() => ({ ok: false }))) as AppEntryOverview | { ok: false; error?: string };
        if (cancelled) return;
        if (res.ok && json.ok) {
          setLoadErr(null);
          setData(json);
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
  }, [reloadKey]);

  const reload = useCallback(() => {
    setLoading(true);
    setLoadErr(null);
    setReloadKey((k) => k + 1);
  }, []);

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_menu_app_entry_overview" description={t("admin_app_entry_ov_desc")} />

      {loading ? (
        <AdminLoadingState ko={ko} />
      ) : loadErr || !data ? (
        <AdminErrorState ko={ko} code={loadErr?.code ?? "load_failed"} httpStatus={loadErr?.httpStatus} onRetry={reload} />
      ) : (
        <>
          <p className="text-[12px] text-sam-muted">
            {t("admin_app_entry_ov_generated", { time: formatAdminManilaDateTime(data.generatedAt) })}
          </p>
          <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" data-app-entry-flow="1">
            <StepCard step={1} title={t("admin_os_launch_title")} href="/admin/platform-promotion/os-start" testId="os">
              {data.os.ok ? (
                <>
                  <p className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="inline-block h-3 w-3 shrink-0 rounded-ui-rect border border-sam-border"
                      style={{ backgroundColor: data.os.build.backgroundColor }}
                    />
                    {t("admin_app_entry_ov_os_current", { color: data.os.build.backgroundColor })}
                  </p>
                  {data.os.pendingChanged ? (
                    <AdminToneBadge tone="waiting">
                      {t("admin_app_entry_ov_os_next_changed", {
                        color: data.os.pending?.backgroundColor ?? data.os.build.backgroundColor,
                      })}
                    </AdminToneBadge>
                  ) : (
                    <p className="text-sam-muted">{t("admin_app_entry_ov_os_next_same")}</p>
                  )}
                  <p className="text-[12px] text-sam-muted">{t("admin_app_entry_os_build_badge")}</p>
                </>
              ) : (
                <FailedLine code={data.os.error} />
              )}
            </StepCard>

            <StepCard step={2} title={t("admin_app_entry_first_title")} href="/admin/platform-promotion/os-start" testId="first-entry">
              {data.firstEntry.ok ? (
                <>
                  <p className="font-semibold">
                    {t("admin_app_entry_ov_first_value", {
                      surface: t(APP_ENTRY_SURFACE_LABEL_KEY[data.firstEntry.initialSurface]),
                      path: data.firstEntry.path,
                    })}
                  </p>
                  {data.firstEntry.source === "default" ? (
                    <p className="text-sam-muted">{t("admin_app_entry_ov_first_default")}</p>
                  ) : data.firstEntry.lastChange.at ? (
                    <p className="text-sam-muted">
                      {data.firstEntry.lastChange.actorLabel
                        ? t("admin_app_entry_first_last_change", {
                            time: formatAdminManilaDateTime(data.firstEntry.lastChange.at),
                            actor: data.firstEntry.lastChange.actorLabel,
                          })
                        : t("admin_app_entry_first_last_change_no_actor", {
                            time: formatAdminManilaDateTime(data.firstEntry.lastChange.at),
                          })}
                    </p>
                  ) : null}
                  <p className="text-[12px] text-sam-muted">{t("admin_app_entry_first_badge")}</p>
                </>
              ) : (
                <FailedLine code={data.firstEntry.error} />
              )}
            </StepCard>

            <StepCard step={3} title={t("admin_menu_settings_intro")} href="/admin/platform-promotion/intro" testId="intro">
              {data.intro.pool.ok ? (
                <>
                  {!data.intro.pool.policyEnabled ? (
                    <AdminToneBadge tone="neutral">{t("admin_app_entry_ov_intro_pool_off")}</AdminToneBadge>
                  ) : data.intro.pool.deviceEntryCount === 0 ? (
                    <AdminToneBadge tone="warning">{t("admin_app_entry_ov_intro_none")}</AdminToneBadge>
                  ) : (
                    <p>
                      {t("admin_app_entry_ov_intro_entries", {
                        count: data.intro.pool.deviceEntryCount,
                        now: data.intro.pool.showingNowCount,
                      })}
                    </p>
                  )}
                  {data.intro.pool.first ? (
                    <p className="font-semibold">
                      {t("admin_app_entry_ov_intro_first", {
                        name: data.intro.pool.first.startsLater
                          ? t("admin_app_entry_ov_intro_first_later", {
                              name: data.intro.pool.first.name ?? t("admin_app_entry_ov_intro_no_name"),
                            })
                          : (data.intro.pool.first.name ?? t("admin_app_entry_ov_intro_no_name")),
                      })}
                    </p>
                  ) : null}
                  {data.intro.pool.policyEnabled ? (
                    <p className="text-sam-muted">
                      {data.intro.pool.showOnOsRestore
                        ? t("admin_app_entry_ov_intro_restore_on")
                        : t("admin_app_entry_ov_intro_restore_off")}
                    </p>
                  ) : null}
                </>
              ) : (
                <FailedLine code={data.intro.pool.error} />
              )}
              {data.intro.scenes.ok ? (
                <p className="text-[12px] text-sam-muted">
                  {t("admin_app_entry_ov_intro_scenes", {
                    state: SCENE_STATE_KEY[data.intro.scenes.state]
                      ? t(SCENE_STATE_KEY[data.intro.scenes.state])
                      : data.intro.scenes.state,
                  })}
                </p>
              ) : (
                <FailedLine code={data.intro.scenes.error} />
              )}
            </StepCard>

            <StepCard step={4} title={t("admin_menu_promotion_popup")} href="/admin/platform-popup" testId="popup">
              {data.popup.policy.ok ? (
                data.popup.policy.enabled ? (
                  <p>{t("admin_app_entry_ov_popup_on", { max: data.popup.policy.maxPerEntry })}</p>
                ) : (
                  <AdminToneBadge tone="neutral">{t("admin_app_entry_ov_popup_off")}</AdminToneBadge>
                )
              ) : (
                <FailedLine code={data.popup.policy.error} />
              )}
              {data.popup.eligible.ok ? (
                <>
                  <p className="font-semibold">{t("admin_app_entry_ov_popup_eligible", { count: data.popup.eligible.count })}</p>
                  <p className="text-[12px] text-sam-muted">{t("admin_app_entry_ov_popup_eligible_note")}</p>
                </>
              ) : (
                <FailedLine code={data.popup.eligible.error} />
              )}
            </StepCard>
          </ol>

          <AdminCard title={t("admin_app_entry_ov_installs_title")}>
            {data.installs.ok ? (
              <div className="space-y-3">
                <p className="text-[12px] text-sam-muted">
                  {t("admin_app_entry_ov_installs_note", { days: data.installs.windowDays })}
                  {data.installs.truncated ? ` · ${t("admin_app_entry_ov_installs_truncated", { limit: formatAdminNumber(data.installs.rowLimit) })}` : ""}
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  <InstallTable platform="Android" rows={data.installs.android} />
                  <InstallTable platform="iOS" rows={data.installs.ios} />
                </div>
              </div>
            ) : (
              <FailedLine code={data.installs.error} />
            )}
          </AdminCard>
        </>
      )}
    </div>
  );
}
