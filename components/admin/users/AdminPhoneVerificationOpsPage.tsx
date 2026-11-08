"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { verifyPhoneCountryLabel } from "@/lib/phone/verify-phone-number";
import Link from "next/link";
import { translateBy } from "@/lib/i18n/translate-by";
import { AdminManagementSurfaceRoot } from "@/components/admin/management";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { AdminStatusLabel } from "@/components/admin/ui/AdminStatusLabel";
import { MEMBER_ADMIN_COPY_KEY } from "@/lib/admin-users/member-admin-copy-ssot";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import {
  MEMBERS_PHONE_OPS_HEALTH_NS,
  MEMBERS_SMS_OUTCOME_NS,
  membersOperatorErrorCode,
} from "@/lib/admin/status-labels/members-status-labels";
import { ADMIN_USERS_LITE_CARD, ADMIN_USERS_LITE_PAGE_BG } from "@/lib/ui/admin-users-lite-styles";

type OpsHealth =
  | "running_ok"
  | "admin_stopped"
  | "config_error"
  | "low_balance"
  | "provider_down"
  | "send_limited"
  | "unverified";

type OpsPayload = {
  settings: {
    enabled: boolean;
    row_version?: number;
    change_reason?: string | null;
    updated_at?: string;
    updated_by?: string | null;
    otp_ttl_seconds: number;
    resend_cooldown_seconds: number;
    max_attempts: number;
    guide_text: string;
    provider: string;
  };
  security: {
    ok: boolean;
    missing: string[];
    envEnableConflict: boolean;
    hashSecretConfigured: boolean;
    semaphoreKeyConfigured: boolean;
  };
  health: OpsHealth;
  healthReasons: string[];
  canEnable: boolean;
  enableBlockers: string[];
  provider: null | {
    ok: boolean;
    checkedAt: string;
    creditBalance?: number | null;
    status?: string | null;
    accountName?: string | null;
    kind?: string;
    detail?: string;
    httpStatus?: number | null;
  };
  recentDeliveries: Array<{
    id: string;
    outcome: string;
    provider_code: string | null;
    error_summary: string | null;
    created_at: string;
  }>;
  dashboardUrl: string;
  creditLowThreshold: number;
};

/** PHT 표기 (YYYY-MM-DD HH:mm PHT). */
function pht(iso: string | null | undefined): string {
  return iso ? `${formatAdminManilaDateTime(iso)} PHT` : "—";
}

function remediation(ops: OpsPayload, lang: string): { title: string; steps: string[] } {
  const tr = (key: Parameters<typeof translateBy>[1], vars?: Record<string, unknown>) => translateBy(lang, key, vars);
  switch (ops.health) {
    case "admin_stopped":
      return {
        title: tr("admin_users_member_phone_ops_admin_stopped_title"),
        steps: [tr("admin_users_member_phone_ops_admin_stopped_step1"), tr("admin_users_member_phone_ops_admin_stopped_step2")],
      };
    case "low_balance":
      return {
        title: tr("admin_users_member_phone_ops_low_balance_title"),
        steps: [tr("admin_users_member_phone_ops_low_balance_step1"), tr("admin_users_member_phone_ops_low_balance_step2")],
      };
    case "config_error":
      return {
        title: tr("admin_users_member_phone_ops_config_error_title"),
        steps: [
          tr("admin_users_member_phone_ops_config_error_missing", { items: ops.security.missing.join(", ") || "—" }),
          tr("admin_users_member_phone_ops_config_error_step2"),
          tr("admin_users_member_phone_ops_config_error_step3"),
        ],
      };
    case "provider_down":
      return {
        title: tr("admin_users_member_phone_ops_provider_down_title"),
        steps: [
          tr("admin_users_member_phone_ops_provider_down_step1"),
          tr("admin_users_member_phone_ops_provider_down_step2"),
          tr("admin_users_member_phone_ops_provider_down_step3"),
        ],
      };
    case "send_limited":
      return {
        title: tr("admin_users_member_phone_ops_send_limited_title"),
        steps: [tr("admin_users_member_phone_ops_send_limited_step1"), tr("admin_users_member_phone_ops_send_limited_step2")],
      };
    case "unverified":
      return {
        title: tr("admin_users_member_phone_ops_unverified_title"),
        steps: [
          tr("admin_users_member_phone_ops_unverified_step1"),
          tr("admin_users_member_phone_ops_unverified_step2"),
          tr("admin_users_member_phone_ops_send_limited_step1"),
        ],
      };
    default:
      return { title: tr("admin_users_member_phone_ops_normal_title"), steps: [tr("admin_users_member_phone_ops_normal_step1")] };
  }
}

export function AdminPhoneVerificationOpsPage() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [ops, setOps] = useState<OpsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  /** 불러오기 실패 (화면 상태) */
  const [loadError, setLoadError] = useState<{ code: string; httpStatus?: number } | null>(null);
  /** 변경·새로고침 결과 안내 */
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async (refresh = false) => {
    setLoadError(null);
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/users/phone-verification/ops${refresh ? "?refresh=1" : ""}`,
        { credentials: "include", cache: "no-store" },
      );
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; ops?: OpsPayload; error?: string };
      if (!res.ok || !json.ok || !json.ops) {
        setLoadError({ code: membersOperatorErrorCode(json.error, "load_failed"), httpStatus: res.status });
        setOps(null);
        return;
      }
      setOps(json.ops);
    } catch {
      setLoadError({ code: "network_error" });
      setOps(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const refreshProvider = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/users/phone-verification/ops/refresh", {
        method: "POST",
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; ops?: OpsPayload; error?: string };
      if (!res.ok || !json.ok || !json.ops) {
        setResult({
          ok: false,
          text: t("admin_users_could_not_refresh_provider_status"),
        });
        return;
      }
      setOps(json.ops);
      setResult({ ok: true, text: t("admin_users_provider_status_refreshed") });
    } catch {
      setResult({ ok: false, text: adminOperatorErrorMessage("network_error", ko) });
    } finally {
      setBusy(false);
    }
  };

  const toggleEnabled = async (next: boolean) => {
    if (!ops) return;
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("runtimeSettingChange"),
      ko,
      title: next
        ? t("admin_users_turn_on_phone_verification")
        : t("admin_users_turn_off_phone_verification"),
      description: next
        ? t("admin_users_resumes_member_phone_verification_sms_security")
        : t("admin_users_stops_member_phone_verification_sms_pending"),
      confirmLabel: next ? (t("admin_users_turn_on")) : t("admin_users_turn_off"),
      destructive: !next,
    });
    if (!confirmed.ok) return;
    const reason = confirmed.reason ?? "";
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/users/phone-verification/ops", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: next,
          reason: reason.trim(),
          expectedVersion: ops.settings.row_version ?? 1,
          confirm: true,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        error?: string;
        blockers?: string[];
        ops?: OpsPayload;
      };
      if (!res.ok || !json.ok) {
        const extra = json.blockers?.length ? ` (${json.blockers.join(", ")})` : "";
        setResult({
          ok: false,
          text:
            (json.message || adminOperatorErrorMessage(membersOperatorErrorCode(json.error, "update_failed"), ko)) +
            extra,
        });
        if (json.ops) setOps(json.ops);
        return;
      }
      setResult({
        ok: true,
        text: next
          ? t("admin_users_phone_verification_turned_on")
          : t("admin_users_phone_verification_turned_off"),
      });
      if (json.ops) setOps(json.ops);
      else await load(false);
    } catch {
      setResult({ ok: false, text: adminOperatorErrorMessage("network_error", ko) });
    } finally {
      setBusy(false);
    }
  };

  const rem = ops ? remediation(ops, language) : null;

  return (
    <AdminManagementSurfaceRoot proofSurface="users" wave="w2" className={`${ADMIN_USERS_LITE_PAGE_BG} space-y-4 pb-6`}>
      <nav className="text-xs font-medium text-sam-muted" aria-label="Breadcrumb">
        <Link href="/admin/users" className="hover:underline">
          {t(MEMBER_ADMIN_COPY_KEY.member_management)}
        </Link>
        <span className="mx-1.5 text-sam-meta">›</span>
        <span className="text-sam-fg">{t("admin_users_phone_verification")}</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-sam-fg">{t("admin_menu_users_phone_verification")}</h1>
          <p className="mt-1 max-w-2xl text-[13px] text-sam-muted">
            {t("admin_users_phone_ops_page_description")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <AdminActionButton variant="secondary" disabled={busy || loading} onClick={() => void refreshProvider()}>
            {t("admin_users_refresh_status")}
          </AdminActionButton>
          <a
            href="https://semaphore.co/dashboard"
            target="_blank"
            rel="noreferrer"
            data-admin-action="quiet"
            className="inline-flex h-10 items-center px-3 text-[14px] font-semibold text-sam-muted hover:text-sam-fg hover:underline"
          >
            {t("admin_users_semaphore_dashboard")}
          </a>
          <AdminActionLink href="/admin/users" variant="quiet">
            {t("admin_users_member_list_title")}
          </AdminActionLink>
        </div>
      </div>

      {result ? (
        <div
          data-admin-result={result.ok ? "success" : "error"}
          role={result.ok ? "status" : "alert"}
          className={`flex items-start justify-between gap-3 rounded-ui-rect border px-3 py-2 text-[13px] text-sam-fg ${
            result.ok ? "border-sam-success bg-sam-success-soft" : "border-sam-danger bg-sam-danger-soft"
          }`}
        >
          <span>{result.text}</span>
          <AdminActionButton variant="quiet" size="sm" className="shrink-0" onClick={() => setResult(null)}>
            {t("common_close")}
          </AdminActionButton>
        </div>
      ) : null}
      {loading ? (
        <AdminLoadingState ko={ko} />
      ) : loadError || !ops ? (
        <AdminErrorState
          ko={ko}
          code={loadError?.code ?? "load_failed"}
          httpStatus={loadError?.httpStatus}
          onRetry={() => void load(false)}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className={`${ADMIN_USERS_LITE_CARD} space-y-3 p-4`} data-phone-otp-ops="control">
            <h2 className="text-sm font-bold text-sam-fg">{t("admin_users_phone_ops_service_control")}</h2>
            <div className="flex flex-wrap items-center gap-2">
              <AdminStatusLabel namespace={MEMBERS_PHONE_OPS_HEALTH_NS} code={ops.health} ko={ko} />
              <span className="text-xs text-sam-muted">
                {t("admin_users_phone_ops_setting_state", { state: ops.settings.enabled ? "ON" : "OFF" })}
              </span>
            </div>
            <p className="text-[12px] text-sam-muted">
              {t("admin_users_phone_ops_last_changed", { at: pht(ops.settings.updated_at) })}
              {ops.settings.change_reason
                ? ` · ${t("admin_users_phone_ops_reason", { reason: ops.settings.change_reason })}`
                : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              <AdminActionButton
                variant="primary"
                disabled={busy || ops.settings.enabled}
                onClick={() => void toggleEnabled(true)}
              >
                {t("admin_users_turn_on")}
              </AdminActionButton>
              <AdminActionButton
                variant="secondary"
                disabled={busy || !ops.settings.enabled}
                onClick={() => void toggleEnabled(false)}
              >
                {t("admin_users_turn_off")}
              </AdminActionButton>
            </div>
            {!ops.canEnable ? (
              <p className="text-[12px] text-sam-warning">
                {t("admin_users_phone_ops_cannot_turn_on", {
                  blockers: ops.enableBlockers.join(", ") || ops.security.missing.join(", "),
                })}
              </p>
            ) : null}
            <p className="text-[12px] text-sam-muted">
              {t("admin_users_phone_ops_otp_settings_line", {
                ttl: ops.settings.otp_ttl_seconds,
                resend: ops.settings.resend_cooldown_seconds,
                maxAttempts: ops.settings.max_attempts,
                provider: ops.settings.provider,
              })}
            </p>
          </section>

          <section className={`${ADMIN_USERS_LITE_CARD} space-y-3 p-4`} data-phone-otp-ops="provider">
            <h2 className="text-sm font-bold text-sam-fg">{t("admin_users_phone_ops_semaphore_status")}</h2>
            {ops.provider?.ok ? (
              <ul className="space-y-1 text-[13px] text-sam-fg">
                <li>{t("admin_users_phone_ops_account", { v: ops.provider.accountName ?? "—" })}</li>
                <li>{t("admin_users_phone_ops_status", { v: ops.provider.status ?? "—" })}</li>
                <li>
                  {t("admin_users_phone_ops_credit_balance")}{" "}
                  {ops.provider.creditBalance != null ? formatAdminNumber(ops.provider.creditBalance) : t("admin_users_phone_ops_unavailable")}
                  {ops.provider.creditBalance != null && ops.provider.creditBalance <= ops.creditLowThreshold
                    ? ` ${t("admin_users_phone_ops_below_threshold")}`
                    : ""}
                </li>
                <li>{t("admin_users_phone_ops_checked_at", { at: pht(ops.provider.checkedAt) })}</li>
              </ul>
            ) : (
              <ul className="space-y-1 text-[13px] text-sam-fg">
                <li>{t("admin_users_phone_ops_lookup_unavailable")}</li>
                <li>{t("admin_users_phone_ops_cause", { v: ops.provider?.kind ?? "not_probed" })}</li>
                <li>{t("admin_users_phone_ops_detail", { v: ops.provider?.detail ?? "—" })}</li>
                <li>HTTP: {ops.provider?.httpStatus ?? "—"}</li>
                <li>{t("admin_users_phone_ops_checked_at", { at: pht(ops.provider?.checkedAt) })}</li>
              </ul>
            )}
            <p className="text-[12px] text-sam-muted">{t("admin_users_phone_ops_api_key_hidden")}</p>
          </section>

          <section className={`${ADMIN_USERS_LITE_CARD} space-y-3 p-4`} data-phone-otp-ops="remediation">
            <h2 className="text-sm font-bold text-sam-fg">{t("admin_users_phone_ops_cause_and_fix")}</h2>
            <p className="text-[13px] font-medium text-sam-fg">{rem?.title}</p>
            <ul className="list-disc space-y-1 pl-5 text-[13px] text-sam-muted">
              {(rem?.steps ?? []).map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            {ops.healthReasons.length > 0 ? (
              <p className="text-[12px] text-sam-muted">{t("admin_users_phone_ops_evidence", { reasons: ops.healthReasons.join(", ") })}</p>
            ) : null}
          </section>

          <section className={`${ADMIN_USERS_LITE_CARD} space-y-3 p-4`} data-phone-otp-ops="deliveries">
            <h2 className="text-sm font-bold text-sam-fg">{t("admin_users_phone_ops_recent_sms")}</h2>
            {ops.recentDeliveries.length === 0 ? (
              <p className="text-[13px] text-sam-muted">
                {t("admin_users_phone_ops_no_delivery_records")}
              </p>
            ) : (
              <ul className="max-h-56 space-y-2 overflow-auto text-[12px] text-sam-fg">
                {ops.recentDeliveries.map((d) => (
                  <li key={d.id} className="rounded-ui-rect border border-sam-border px-2 py-1.5">
                    <AdminStatusLabel namespace={MEMBERS_SMS_OUTCOME_NS} code={d.outcome} ko={ko} />{" "}
                    · {pht(d.created_at)}
                    {d.provider_code
                      ? ` · ${verifyPhoneCountryLabel(
                          String(d.provider_code).startsWith("solapi") ? "KR" : "PH",
                          language === "en" ? "en" : "ko",
                        )} · ${d.provider_code}`
                      : ""}
                    {d.error_summary ? ` · ${d.error_summary}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </AdminManagementSurfaceRoot>
  );
}
