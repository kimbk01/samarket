"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import Link from "next/link";
import { dibayConfirm, dibayPrompt, dibayAlert } from "@/components/ui/dibay-overlay";
import { AdminManagementSurfaceRoot } from "@/components/admin/management";
import { MEMBER_ADMIN_COPY } from "@/lib/admin-users/member-admin-copy-ssot";
import {
  ADMIN_USERS_LITE_BTN_PRIMARY,
  ADMIN_USERS_LITE_BTN_SECONDARY,
  ADMIN_USERS_LITE_BTN_TERTIARY,
  ADMIN_USERS_LITE_CARD,
  ADMIN_USERS_LITE_PAGE_BG,
} from "@/lib/ui/admin-users-lite-styles";

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

const HEALTH_KO: Record<OpsHealth, string> = {
  running_ok: "정상 운영",
  admin_stopped: "관리자 중지",
  config_error: "설정 오류",
  low_balance: "잔액 부족",
  provider_down: "공급자 장애",
  send_limited: "발송 제한",
  unverified: "확인 불가",
};

function healthClass(h: OpsHealth): string {
  if (h === "running_ok") return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (h === "admin_stopped") return "bg-slate-100 text-slate-700 border-slate-200";
  if (h === "config_error" || h === "low_balance" || h === "provider_down") {
    return "bg-amber-50 text-amber-900 border-amber-200";
  }
  return "bg-orange-50 text-orange-900 border-orange-200";
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
        steps: ["잠시 후 상태 새로고침을 다시 시도합니다.", "대시보드에서 한도를 확인합니다."],
      };
    case "unverified":
      return {
        title: "공급자 상태 확인 불가",
        steps: ["추정 배지를 사용하지 않습니다.", "Semaphore 대시보드에서 직접 확인합니다.", "새로고침을 재시도합니다."],
      };
    default:
      return { title: "정상", steps: ["추가 조치가 필요하지 않습니다."] };
  }
}

export function AdminPhoneVerificationOpsPage() {
  const { t } = useI18n();
  const [ops, setOps] = useState<OpsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/users/phone-verification/ops${refresh ? "?refresh=1" : ""}`,
        { credentials: "include", cache: "no-store" },
      );
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; ops?: OpsPayload; error?: string };
      if (!res.ok || !json.ok || !json.ops) {
        setError(json.error === "forbidden" ? "권한이 없습니다. (settings)" : "운영 상태를 불러오지 못했습니다.");
        setOps(null);
        return;
      }
      setOps(json.ops);
    } catch {
      setError("운영 상태를 불러오지 못했습니다.");
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
    setError(null);
    try {
      const res = await fetch("/api/admin/users/phone-verification/ops/refresh", {
        method: "POST",
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; ops?: OpsPayload; error?: string };
      if (!res.ok || !json.ok || !json.ops) {
        setError("공급자 상태 새로고침에 실패했습니다.");
        return;
      }
      setOps(json.ops);
    } finally {
      setBusy(false);
    }
  };

  const toggleEnabled = async (next: boolean) => {
    if (!ops) return;
    const title = next
      ? "전화 인증을 켜시겠습니까? 진행 전 보안 설정을 확인합니다."
      : "전화 인증을 끄시겠습니까? 진행 중 인증번호는 즉시 무효화됩니다.";
    if (!(await dibayConfirm({ title, confirmTone: next ? "primary" : "destructive" }))) return;
    const reason = await dibayPrompt({
      title: "변경 사유를 입력해 주세요",
      defaultValue: "",
    });
    if (!reason || reason.trim().length < 2) {
      await dibayAlert({ title: "변경 사유가 필요합니다." });
      return;
    }
    if (
      !(await dibayConfirm({
        title: next ? "최종 확인: 서비스를 ON 합니다." : "최종 확인: 서비스를 OFF 하고 미완료 OTP를 무효화합니다.",
        confirmTone: next ? "primary" : "destructive",
      }))
    ) {
      return;
    }
    setBusy(true);
    setError(null);
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
        setError((json.message || json.error || "변경에 실패했습니다.") + extra);
        if (json.ops) setOps(json.ops);
        return;
      }
      if (json.ops) setOps(json.ops);
      else await load(false);
    } finally {
      setBusy(false);
    }
  };

  const rem = ops ? remediation(ops) : null;

  return (
    <AdminManagementSurfaceRoot proofSurface="users" wave="w2" className={`${ADMIN_USERS_LITE_PAGE_BG} space-y-4 pb-6`}>
      <nav className="text-xs font-medium text-[#667085]" aria-label="Breadcrumb">
        <Link href="/admin/users" className="hover:underline">
          {MEMBER_ADMIN_COPY.member_management}
        </Link>
        <span className="mx-1.5 text-[#98a2b3]">›</span>
        <span className="text-[#344054]">전화번호 인증 관리</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#101828]">{t("admin_menu_users_phone_verification")}</h1>
          <p className="mt-1 max-w-2xl text-[13px] text-[#667085]">
            서비스 ON/OFF·공급자 건강도·잔액·발송 결과를 관리합니다. 회원별 승인·초기화는 회원 상세에서 진행합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={ADMIN_USERS_LITE_BTN_SECONDARY} disabled={busy || loading} onClick={() => void refreshProvider()}>
            상태 새로고침
          </button>
          <a
            href="https://semaphore.co/dashboard"
            target="_blank"
            rel="noreferrer"
            className={ADMIN_USERS_LITE_BTN_TERTIARY}
          >
            Semaphore 대시보드
          </a>
          <Link href="/admin/users" className={ADMIN_USERS_LITE_BTN_TERTIARY}>
            회원 목록
          </Link>
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {loading || !ops ? (
        <div className={`${ADMIN_USERS_LITE_CARD} p-4 text-sm text-[#667085]`}>불러오는 중…</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className={`${ADMIN_USERS_LITE_CARD} space-y-3 p-4`} data-phone-otp-ops="control">
            <h2 className="text-sm font-bold text-[#101828]">서비스 제어</h2>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex rounded-ui-rect border px-2.5 py-1 text-xs font-semibold ${healthClass(ops.health)}`}
              >
                {HEALTH_KO[ops.health]}
              </span>
              <span className="text-xs text-[#667085]">설정: {ops.settings.enabled ? "ON" : "OFF"}</span>
            </div>
            <p className="text-[12px] text-[#667085]">
              마지막 변경: {ops.settings.updated_at ? new Date(ops.settings.updated_at).toLocaleString() : "—"}
              {ops.settings.change_reason ? ` · 사유: ${ops.settings.change_reason}` : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={ADMIN_USERS_LITE_BTN_PRIMARY}
                disabled={busy || ops.settings.enabled}
                onClick={() => void toggleEnabled(true)}
              >
                서비스 ON
              </button>
              <button
                type="button"
                className={ADMIN_USERS_LITE_BTN_SECONDARY}
                disabled={busy || !ops.settings.enabled}
                onClick={() => void toggleEnabled(false)}
              >
                서비스 OFF
              </button>
            </div>
            {!ops.canEnable ? (
              <p className="text-[12px] text-amber-800">
                ON 불가: {ops.enableBlockers.join(", ") || ops.security.missing.join(", ")}
              </p>
            ) : null}
            <p className="text-[12px] text-[#667085]">
              TTL {ops.settings.otp_ttl_seconds}s · 재전송 {ops.settings.resend_cooldown_seconds}s · 최대시도{" "}
              {ops.settings.max_attempts} · provider {ops.settings.provider}
            </p>
          </section>

          <section className={`${ADMIN_USERS_LITE_CARD} space-y-3 p-4`} data-phone-otp-ops="provider">
            <h2 className="text-sm font-bold text-[#101828]">Semaphore 상태</h2>
            {ops.provider?.ok ? (
              <ul className="space-y-1 text-[13px] text-[#344054]">
                <li>계정: {ops.provider.accountName ?? "—"}</li>
                <li>상태: {ops.provider.status ?? "—"}</li>
                <li>
                  잔액(크레딧):{" "}
                  {ops.provider.creditBalance != null ? ops.provider.creditBalance : "확인 불가"}
                  {ops.provider.creditBalance != null && ops.provider.creditBalance <= ops.creditLowThreshold
                    ? " (임계 이하)"
                    : ""}
                </li>
                <li>확인 시각: {new Date(ops.provider.checkedAt).toLocaleString()}</li>
              </ul>
            ) : (
              <ul className="space-y-1 text-[13px] text-[#344054]">
                <li>조회: 확인 불가</li>
                <li>원인: {ops.provider?.kind ?? "not_probed"}</li>
                <li>상세: {ops.provider?.detail ?? "—"}</li>
                <li>HTTP: {ops.provider?.httpStatus ?? "—"}</li>
                <li>확인 시각: {ops.provider?.checkedAt ? new Date(ops.provider.checkedAt).toLocaleString() : "—"}</li>
              </ul>
            )}
            <p className="text-[12px] text-[#667085]">API Key는 화면에 표시하지 않습니다.</p>
          </section>

          <section className={`${ADMIN_USERS_LITE_CARD} space-y-3 p-4`} data-phone-otp-ops="remediation">
            <h2 className="text-sm font-bold text-[#101828]">장애 원인 · 조치</h2>
            <p className="text-[13px] font-medium text-[#101828]">{rem?.title}</p>
            <ul className="list-disc space-y-1 pl-5 text-[13px] text-[#475467]">
              {(rem?.steps ?? []).map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            {ops.healthReasons.length > 0 ? (
              <p className="text-[12px] text-[#667085]">근거: {ops.healthReasons.join(", ")}</p>
            ) : null}
          </section>

          <section className={`${ADMIN_USERS_LITE_CARD} space-y-3 p-4`} data-phone-otp-ops="deliveries">
            <h2 className="text-sm font-bold text-[#101828]">최근 SMS 발송</h2>
            {ops.recentDeliveries.length === 0 ? (
              <p className="text-[13px] text-[#667085]">
                내부 발송 기록이 없거나 테이블이 아직 없습니다. (마이그레이션 적용 후 수집)
              </p>
            ) : (
              <ul className="max-h-56 space-y-2 overflow-auto text-[12px] text-[#344054]">
                {ops.recentDeliveries.map((d) => (
                  <li key={d.id} className="rounded-ui-rect border border-[#e4e7ec] px-2 py-1.5">
                    <span className={d.outcome === "success" ? "text-emerald-700" : "text-red-700"}>
                      {d.outcome}
                    </span>{" "}
                    · {new Date(d.created_at).toLocaleString()}
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
