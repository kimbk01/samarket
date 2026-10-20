"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import Link from "next/link";
import { AdminManagementSurfaceRoot } from "@/components/admin/management";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { AdminStatusLabel } from "@/components/admin/ui/AdminStatusLabel";
import { MEMBER_ADMIN_COPY } from "@/lib/admin-users/member-admin-copy-ssot";
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

function remediation(ops: OpsPayload): { title: string; steps: string[] } {
  switch (ops.health) {
    case "admin_stopped":
      return {
        title: "관리자 수동 중지",
        steps: ["중지 사유를 확인합니다.", "보안·공급자 상태가 정상이면 ON으로 전환합니다."],
      };
    case "low_balance":
      return {
        title: "SMS 잔액 부족(실측)",
        steps: ["Semaphore 대시보드에서 잔액을 충전합니다.", "상태 새로고침으로 잔액을 재확인합니다."],
      };
    case "config_error":
      return {
        title: "서버 보안·설정 오류",
        steps: [
          `누락/충돌: ${ops.security.missing.join(", ") || "—"}`,
          "서버 환경 변수·키를 조치한 뒤 새로고침합니다.",
          "필수 설정이 충족되기 전에는 ON이 거부됩니다.",
        ],
      };
    case "provider_down":
      return {
        title: "공급자 장애",
        steps: ["오류 코드·시각을 확인합니다.", "공급자 복구 후 상태 새로고침합니다.", "enabled는 자동으로 바꾸지 않습니다."],
      };
    case "send_limited":
      return {
        title: "API 발송/조회 제한",
        steps: ["잠시 후 상태를 새로고침합니다.", "대시보드에서 한도를 확인합니다."],
      };
    case "unverified":
      return {
        title: "공급자 상태 확인 불가",
        steps: ["추정 배지를 사용하지 않습니다.", "Semaphore 대시보드에서 직접 확인합니다.", "잠시 후 상태를 새로고침합니다."],
      };
    default:
      return { title: "정상", steps: ["추가 조치가 필요하지 않습니다."] };
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
          text: ko ? "공급자 상태를 새로고침하지 못했습니다." : "Could not refresh the provider status.",
        });
        return;
      }
      setOps(json.ops);
      setResult({ ok: true, text: ko ? "공급자 상태를 새로고침했습니다." : "Provider status refreshed." });
    } catch {
      setResult({ ok: false, text: adminOperatorErrorMessage("network_error", ko) });
    } finally {
      setBusy(false);
    }
  };

  const toggleEnabled = async (next: boolean) => {
    if (!ops) return;
    const confirmed = await confirmAdminAction({
      level: "L2",
      ko,
      title: next
        ? ko
          ? "전화 인증 서비스 켜기"
          : "Turn on phone verification"
        : ko
          ? "전화 인증 서비스 끄기"
          : "Turn off phone verification",
      description: next
        ? ko
          ? "회원 전화 인증 발송을 다시 시작합니다. 진행 전 보안 설정을 확인합니다."
          : "Resumes member phone verification SMS. Security settings are checked first."
        : ko
          ? "회원 전화 인증 발송을 멈춥니다. 진행 중인 인증번호는 즉시 무효화됩니다."
          : "Stops member phone verification SMS. Pending codes are invalidated immediately.",
      confirmLabel: next ? (ko ? "서비스 켜기" : "Turn on") : ko ? "서비스 끄기" : "Turn off",
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
          ? ko
            ? "전화 인증 서비스를 켰습니다."
            : "Phone verification turned on."
          : ko
            ? "전화 인증 서비스를 껐습니다."
            : "Phone verification turned off.",
      });
      if (json.ops) setOps(json.ops);
      else await load(false);
    } catch {
      setResult({ ok: false, text: adminOperatorErrorMessage("network_error", ko) });
    } finally {
      setBusy(false);
    }
  };

  const rem = ops ? remediation(ops) : null;

  return (
    <AdminManagementSurfaceRoot proofSurface="users" wave="w2" className={`${ADMIN_USERS_LITE_PAGE_BG} space-y-4 pb-6`}>
      <nav className="text-xs font-medium text-sam-muted" aria-label="Breadcrumb">
        <Link href="/admin/users" className="hover:underline">
          {MEMBER_ADMIN_COPY.member_management}
        </Link>
        <span className="mx-1.5 text-sam-meta">›</span>
        <span className="text-sam-fg">전화번호 인증 관리</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-sam-fg">{t("admin_menu_users_phone_verification")}</h1>
          <p className="mt-1 max-w-2xl text-[13px] text-sam-muted">
            서비스 ON/OFF·공급자 건강도·잔액·발송 결과를 관리합니다. 회원별 승인·초기화는 회원 상세에서 진행합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <AdminActionButton variant="secondary" disabled={busy || loading} onClick={() => void refreshProvider()}>
            {ko ? "상태 새로고침" : "Refresh status"}
          </AdminActionButton>
          <a
            href="https://semaphore.co/dashboard"
            target="_blank"
            rel="noreferrer"
            data-admin-action="quiet"
            className="inline-flex h-10 items-center px-3 text-[14px] font-semibold text-sam-muted hover:text-sam-fg hover:underline"
          >
            {ko ? "Semaphore 대시보드" : "Semaphore dashboard"}
          </a>
          <AdminActionLink href="/admin/users" variant="quiet">
            {ko ? "회원 목록" : "Member list"}
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
            {ko ? "닫기" : "Close"}
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
            <h2 className="text-sm font-bold text-sam-fg">서비스 제어</h2>
            <div className="flex flex-wrap items-center gap-2">
              <AdminStatusLabel namespace={MEMBERS_PHONE_OPS_HEALTH_NS} code={ops.health} ko={ko} />
              <span className="text-xs text-sam-muted">설정: {ops.settings.enabled ? "ON" : "OFF"}</span>
            </div>
            <p className="text-[12px] text-sam-muted">
              마지막 변경: {pht(ops.settings.updated_at)}
              {ops.settings.change_reason ? ` · 사유: ${ops.settings.change_reason}` : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              <AdminActionButton
                variant="primary"
                disabled={busy || ops.settings.enabled}
                onClick={() => void toggleEnabled(true)}
              >
                {ko ? "서비스 켜기" : "Turn on"}
              </AdminActionButton>
              <AdminActionButton
                variant="secondary"
                disabled={busy || !ops.settings.enabled}
                onClick={() => void toggleEnabled(false)}
              >
                {ko ? "서비스 끄기" : "Turn off"}
              </AdminActionButton>
            </div>
            {!ops.canEnable ? (
              <p className="text-[12px] text-sam-warning">
                ON 불가: {ops.enableBlockers.join(", ") || ops.security.missing.join(", ")}
              </p>
            ) : null}
            <p className="text-[12px] text-sam-muted">
              TTL {ops.settings.otp_ttl_seconds}s · 재전송 {ops.settings.resend_cooldown_seconds}s · 최대시도{" "}
              {ops.settings.max_attempts} · provider {ops.settings.provider}
            </p>
          </section>

          <section className={`${ADMIN_USERS_LITE_CARD} space-y-3 p-4`} data-phone-otp-ops="provider">
            <h2 className="text-sm font-bold text-sam-fg">Semaphore 상태</h2>
            {ops.provider?.ok ? (
              <ul className="space-y-1 text-[13px] text-sam-fg">
                <li>계정: {ops.provider.accountName ?? "—"}</li>
                <li>상태: {ops.provider.status ?? "—"}</li>
                <li>
                  잔액(크레딧):{" "}
                  {ops.provider.creditBalance != null ? formatAdminNumber(ops.provider.creditBalance) : "확인 불가"}
                  {ops.provider.creditBalance != null && ops.provider.creditBalance <= ops.creditLowThreshold
                    ? " (임계 이하)"
                    : ""}
                </li>
                <li>확인 시각: {pht(ops.provider.checkedAt)}</li>
              </ul>
            ) : (
              <ul className="space-y-1 text-[13px] text-sam-fg">
                <li>조회: 확인 불가</li>
                <li>원인: {ops.provider?.kind ?? "not_probed"}</li>
                <li>상세: {ops.provider?.detail ?? "—"}</li>
                <li>HTTP: {ops.provider?.httpStatus ?? "—"}</li>
                <li>확인 시각: {pht(ops.provider?.checkedAt)}</li>
              </ul>
            )}
            <p className="text-[12px] text-sam-muted">API Key는 화면에 표시하지 않습니다.</p>
          </section>

          <section className={`${ADMIN_USERS_LITE_CARD} space-y-3 p-4`} data-phone-otp-ops="remediation">
            <h2 className="text-sm font-bold text-sam-fg">장애 원인 · 조치</h2>
            <p className="text-[13px] font-medium text-sam-fg">{rem?.title}</p>
            <ul className="list-disc space-y-1 pl-5 text-[13px] text-sam-muted">
              {(rem?.steps ?? []).map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            {ops.healthReasons.length > 0 ? (
              <p className="text-[12px] text-sam-muted">근거: {ops.healthReasons.join(", ")}</p>
            ) : null}
          </section>

          <section className={`${ADMIN_USERS_LITE_CARD} space-y-3 p-4`} data-phone-otp-ops="deliveries">
            <h2 className="text-sm font-bold text-sam-fg">최근 SMS 발송</h2>
            {ops.recentDeliveries.length === 0 ? (
              <p className="text-[13px] text-sam-muted">
                내부 발송 기록이 없거나 테이블이 아직 없습니다. (마이그레이션 적용 후 수집)
              </p>
            ) : (
              <ul className="max-h-56 space-y-2 overflow-auto text-[12px] text-sam-fg">
                {ops.recentDeliveries.map((d) => (
                  <li key={d.id} className="rounded-ui-rect border border-sam-border px-2 py-1.5">
                    <AdminStatusLabel namespace={MEMBERS_SMS_OUTCOME_NS} code={d.outcome} ko={ko} />{" "}
                    · {pht(d.created_at)}
                    {d.provider_code ? ` · ${d.provider_code}` : ""}
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
