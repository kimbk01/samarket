"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Sam } from "@/lib/ui/sam-component-classes";
import { AdminErrorState, AdminResultBanner, AdminTechDetails } from "@/components/admin/ui/AdminStateViews";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";

type RuntimeHealthPayload = {
  ok?: boolean;
  error?: string;
  hint?: string;
  capabilities?: {
    pg_version?: string | null;
    pg_version_num?: number | null;
    supports_pg_cron?: boolean;
    supports_publication_column_filter?: boolean;
    supports_advanced_rpc?: boolean;
    supports_advisory_lock?: boolean;
    supports_realtime_optimization?: boolean;
    checked_at?: string | null;
  } | null;
  settings?: Record<string, unknown>;
  effective?: Record<string, unknown>;
  warnings?: { code: string; message: string }[];
};

const SETTINGS_KEYS = [
  "enable_pg_cron",
  "enable_realtime_optimization",
  "enable_delivery_realtime_filtering",
  "enable_alert_runner",
  "enable_recovery_runner",
  "enable_auto_actions",
] as const;

const SETTING_LABELS: Record<(typeof SETTINGS_KEYS)[number], { ko: string; en: string; descKo: string; descEn: string }> = {
  enable_pg_cron: {
    ko: "예약 작업 실행",
    en: "Scheduled jobs",
    descKo: "DB 예약 작업(주기 스캔 등)을 서버에서 자동 실행합니다.",
    descEn: "Runs periodic database jobs (scans, etc.) automatically.",
  },
  enable_realtime_optimization: {
    ko: "실시간 전송 최적화",
    en: "Realtime optimization",
    descKo: "실시간 알림 전송량을 줄이는 최적화를 사용합니다.",
    descEn: "Uses optimizations that reduce realtime traffic.",
  },
  enable_delivery_realtime_filtering: {
    ko: "배달 실시간 필터링",
    en: "Delivery realtime filtering",
    descKo: "배달 화면에 필요한 변경만 실시간으로 받도록 거릅니다.",
    descEn: "Filters realtime updates to what delivery screens need.",
  },
  enable_alert_runner: {
    ko: "배달 경고 자동 생성",
    en: "Delivery alert runner",
    descKo: "SLA 규칙에 따라 배달 경고를 자동으로 만듭니다.",
    descEn: "Creates delivery alerts automatically from SLA rules.",
  },
  enable_recovery_runner: {
    ko: "자동 복구 실행",
    en: "Recovery runner",
    descKo: "멈춘 주문·알림을 주기적으로 자동 복구합니다.",
    descEn: "Periodically recovers stuck orders and alerts.",
  },
  enable_auto_actions: {
    ko: "자동 조치",
    en: "Auto actions",
    descKo: "표시 전용 — 어떤 실행기도 이 값을 읽지 않습니다. 실제 켜기/끄기는 「자동 조치」 화면에서 합니다.",
    descEn: "Display only — no runner reads this value. Turn auto actions on/off on the Auto actions page.",
  },
};

/** 코드 형태(snake_case)만 오류 코드로 사용 — 원문 메시지는 노출하지 않는다. */
function errCode(status: number, j: { error?: unknown } | null, fallback: string): string {
  const e = j?.error;
  if (typeof e === "string" && /^[a-z][a-z0-9_]*$/i.test(e.trim())) return e.trim();
  if (status === 403) return "forbidden";
  return fallback;
}

function toBool(v: unknown): boolean {
  return v === true;
}

export function AdminRuntimeHealthPage() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [errStatus, setErrStatus] = useState<number | undefined>(undefined);
  const [result, setResult] = useState<{ ok: true; message: string } | { ok: false; code: string } | null>(null);
  const [data, setData] = useState<RuntimeHealthPayload | null>(null);

  const load = useCallback(async (force?: boolean) => {
    setErr(null);
    setErrStatus(undefined);
    try {
      const r = await fetch(`/api/admin/runtime-health${force ? "?force=1" : ""}`, { cache: "no-store" });
      const j = (await r.json().catch(() => null)) as RuntimeHealthPayload | null;
      if (!r.ok || !j?.ok) {
        setErr(errCode(r.status, j, "load_failed"));
        setErrStatus(r.status);
        setData(j);
        return;
      }
      setData(j);
    } catch {
      setErr("network_error");
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      setLoading(true);
      await load(false);
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  const caps = data?.capabilities ?? null;
  const settings = (data?.settings ?? {}) as Record<string, unknown>;
  const effective = (data?.effective ?? {}) as Record<string, unknown>;

  const rows = useMemo(() => {
    return SETTINGS_KEYS.map((k) => {
      const desired = toBool(settings[k]);
      const eff = toBool(effective[k]);
      const mismatch = desired && !eff;
      return { key: k, desired, effective: eff, mismatch };
    });
  }, [settings, effective]);

  const patchSetting = async (key: (typeof SETTINGS_KEYS)[number], next: boolean) => {
    if (busy) return;
    const label = ko ? SETTING_LABELS[key].ko : SETTING_LABELS[key].en;
    const c = await confirmAdminAction({
      level: "L2",
      ko,
      title: ko ? `${label}을(를) ${next ? "켤까요" : "끌까요"}?` : `Turn ${next ? "on" : "off"} ${label}?`,
      description: ko
        ? `${SETTING_LABELS[key].descKo} 전체 서비스에 즉시 적용됩니다.`
        : `${SETTING_LABELS[key].descEn} Applies to the whole service immediately.`,
      confirmLabel: next ? (ko ? "켜기" : "Turn on") : ko ? "끄기" : "Turn off",
      destructive: !next,
    });
    if (!c.ok) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await fetch("/api/admin/runtime-health", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: next, reason: c.reason }),
      });
      const j = (await r.json().catch(() => null)) as RuntimeHealthPayload | null;
      if (!r.ok || !j?.ok) {
        setResult({ ok: false, code: errCode(r.status, j, "update_failed") });
        return;
      }
      // merge server truth
      setData((prev) => ({ ...(prev ?? {}), ...j, ok: true }));
      setResult({
        ok: true,
        message: ko ? `${label}: ${next ? "켜짐" : "꺼짐"}으로 저장했습니다.` : `${label} saved as ${next ? "on" : "off"}.`,
      });
    } catch {
      setResult({ ok: false, code: "network_error" });
    } finally {
      setBusy(false);
    }
  };

  const titleLine = ko ? "런타임 상태" : "Runtime health";
  const pgLine = caps?.pg_version
    ? `${caps.pg_version}${caps.pg_version_num ? ` (${caps.pg_version_num})` : ""}`
    : ko
      ? "확인 불가"
      : "unknown";
  const yesNo = (v: boolean) => (v ? (ko ? "지원" : "supported") : ko ? "미지원" : "no");
  const onOff = (v: boolean) => (v ? (ko ? "켜짐" : "on") : ko ? "꺼짐" : "off");

  return (
    <div className={`${Sam.page} bg-sam-app min-h-[70vh] px-4 py-8`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-sam-fg">{titleLine}</h1>
          <p className="mt-1 text-sm text-sam-muted">{t("admin_runtime_health_subtitle")}</p>
        </div>
        <button
          className={Sam.btn.secondary}
          disabled={busy || loading}
          onClick={() => void load(true)}
          type="button"
        >
          {t("admin_runtime_health_refresh")}
        </button>
      </div>

      <div className={`mt-6 ${Sam.card.base} ${Sam.card.pad}`}>
        <div className="text-sm text-sam-muted">{ko ? "데이터베이스 버전" : "Database version"}</div>
        <div className="mt-1 text-sam-fg font-medium">{pgLine}</div>
        {caps?.checked_at ? (
          <div className="mt-2 text-xs text-sam-muted">
            {ko ? "확인 시각" : "Checked at"}: {caps.checked_at.slice(0, 19).replace("T", " ")}
          </div>
        ) : null}
      </div>

      {result ? (
        <div className="mt-6">
          <AdminResultBanner ko={ko} result={result} onClose={() => setResult(null)} />
        </div>
      ) : null}

      {loading ? (
        <div className="mt-6 text-sam-muted">{t("common_loading")}</div>
      ) : err ? (
        <div className="mt-6">
          <AdminErrorState ko={ko} code={err} httpStatus={errStatus} onRetry={() => void load(true)} />
          {data?.hint ? <AdminTechDetails ko={ko}>{data.hint}</AdminTechDetails> : null}
        </div>
      ) : null}

      {data?.warnings?.length ? (
        <div className={`mt-6 ${Sam.card.base} ${Sam.card.pad} border border-amber-300`}>
          <div className="font-medium text-amber-800">{t("admin_runtime_health_warnings_title")}</div>
          <ul className="mt-2 space-y-1 text-sm text-amber-900">
            {data.warnings.map((w) => (
              <li key={w.code}>{w.message}</li>
            ))}
          </ul>
          <AdminTechDetails ko={ko}>{data.warnings.map((w) => w.code).join(", ")}</AdminTechDetails>
        </div>
      ) : null}

      <div className={`mt-6 ${Sam.card.base} ${Sam.card.pad}`}>
        <div className="font-medium text-sam-fg">{ko ? "데이터베이스 지원 기능" : "Capabilities"}</div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-sam-muted">{ko ? "예약 작업" : "pg_cron"}</span>{" "}
            <span className="font-medium text-sam-fg">{yesNo(toBool(caps?.supports_pg_cron))}</span>
          </div>
          <div>
            <span className="text-sam-muted">{ko ? "실시간 열 필터" : "publication column filter"}</span>{" "}
            <span className="font-medium text-sam-fg">
              {yesNo(toBool(caps?.supports_publication_column_filter))}
            </span>
          </div>
          <div>
            <span className="text-sam-muted">{ko ? "고급 함수" : "advanced rpc"}</span>{" "}
            <span className="font-medium text-sam-fg">{yesNo(toBool(caps?.supports_advanced_rpc))}</span>
          </div>
          <div>
            <span className="text-sam-muted">{ko ? "중복 실행 잠금" : "advisory lock"}</span>{" "}
            <span className="font-medium text-sam-fg">
              {yesNo(toBool(caps?.supports_advisory_lock))}
            </span>
          </div>
          <div>
            <span className="text-sam-muted">{ko ? "실시간 최적화" : "realtime optimization"}</span>{" "}
            <span className="font-medium text-sam-fg">
              {yesNo(toBool(caps?.supports_realtime_optimization))}
            </span>
          </div>
        </div>
      </div>

      <div className={`mt-6 ${Sam.card.base} ${Sam.card.pad}`}>
        <div className="font-medium text-sam-fg">{ko ? "런타임 설정 (설정값 → 실제 적용)" : "Runtime settings (desired → effective)"}</div>
        <div className="mt-3 space-y-2">
          {rows.map((r) => (
            <div key={r.key} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-sam-fg">
                  {ko ? SETTING_LABELS[r.key].ko : SETTING_LABELS[r.key].en}
                </div>
                <div className="text-xs text-sam-muted">{ko ? SETTING_LABELS[r.key].descKo : SETTING_LABELS[r.key].descEn}</div>
                <div className="text-xs text-sam-muted">
                  {ko ? "설정값" : "Desired"}: {onOff(r.desired)} · {ko ? "실제 적용" : "Effective"}: {onOff(r.effective)}
                  {r.mismatch ? (ko ? " · 지원되지 않아 꺼진 상태로 동작" : " · fallback (unsupported)") : ""}
                </div>
                <AdminTechDetails ko={ko}>{r.key}</AdminTechDetails>
              </div>
              {r.key === "enable_auto_actions" ? (
                // DEF-42: 자동 조치 ON/OFF 권위 = delivery_auto_actions_runtime_settings (자동 조치 화면).
                // 이 값은 어떤 러너도 읽지 않으므로 여기서는 표시만 하고 권위 화면으로 연결한다.
                <a
                  href="/admin/delivery-auto-actions"
                  className="shrink-0 text-xs font-medium text-signature underline"
                  title={t("admin_r4c_auto_actions_authority_hint")}
                >
                  {t("admin_r4c_auto_actions_authority_link")}
                </a>
              ) : (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  className={Sam.btn.secondary}
                  disabled={busy || !r.desired}
                  onClick={() => void patchSetting(r.key, false)}
                  type="button"
                >
                  {ko ? "끄기" : "OFF"}
                </button>
                <button
                  className={Sam.btn.primary}
                  disabled={busy || r.desired}
                  onClick={() => void patchSetting(r.key, true)}
                  type="button"
                >
                  {ko ? "켜기" : "ON"}
                </button>
              </div>
              )}
            </div>
          ))}
        </div>
        <div className="mt-4 text-xs text-sam-muted">
          {t("admin_runtime_health_effective_hint")}
        </div>
      </div>
    </div>
  );
}

