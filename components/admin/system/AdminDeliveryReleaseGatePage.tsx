"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Sam } from "@/lib/ui/sam-component-classes";
import {
  AdminErrorState,
  AdminLoadingState,
  AdminResultBanner,
  AdminTechDetails,
  AdminEmptyState,
} from "@/components/admin/ui/AdminStateViews";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { useAdminRouteAction } from "@/components/admin/access/use-admin-route-access";

/** 서버가 내려주는 영어 링크 이름 → 운영자 문구 (경로 기준). */
const LINK_LABELS: Record<string, { ko: string; en: string }> = {
  "/admin/runtime-health": { ko: "런타임 상태", en: "Runtime health" },
  "/admin/ops-console": { ko: "운영 콘솔", en: "Ops console" },
  "/admin/delivery-operations": { ko: "배달 운영 현황", en: "Delivery operations" },
  "/admin/delivery-auto-actions": { ko: "자동 조치 승인", en: "Auto action approval" },
  "/admin/delivery-alerts": { ko: "배달 경고", en: "Delivery alerts" },
  "/admin/stores/orders": { ko: "주문 목록", en: "Orders" },
};

const OVERALL_LABELS: Record<string, { ko: string; en: string }> = {
  READY: { ko: "준비됨", en: "Ready" },
  WARNING: { ko: "주의", en: "Warning" },
  BLOCKED: { ko: "차단", en: "Blocked" },
};

const STATUS_LABELS: Record<GateStatus, { ko: string; en: string }> = {
  pass: { ko: "통과", en: "Pass" },
  warn: { ko: "주의", en: "Warning" },
  fail: { ko: "차단", en: "Fail" },
  needs_check: { ko: "확인 필요", en: "Needs check" },
};

function errCode(status: number, j: { error?: unknown } | null, fallback: string): string {
  const e = j?.error;
  if (typeof e === "string" && /^[a-z][a-z0-9_]*$/i.test(e.trim())) return e.trim();
  if (status === 403) return "forbidden";
  return fallback;
}

function fmtTs(v: string | null | undefined): string {
  return formatAdminManilaDateTime(v);
}

type GateStatus = "pass" | "warn" | "fail" | "needs_check";

type GateItem = {
  key: string;
  status: GateStatus;
  title: string;
  description: string;
  howTo: string;
  links: { label: string; href: string }[];
  checked_at?: string | null;
};

type ManualRow = {
  key: string;
  label: string;
  checked: boolean;
  checked_at: string | null;
  checked_by: string | null;
  note: string | null;
  updated_at: string | null;
};

type GatePayload = {
  ok?: boolean;
  error?: string;
  hint?: string;
  generated_at?: string;
  gate?: {
    overall?: "READY" | "WARNING" | "BLOCKED";
    items?: GateItem[];
    manual?: ManualRow[];
  };
};

function badgeClass(st: GateStatus): string {
  if (st === "pass") return "bg-sam-success-soft text-sam-success border-sam-success/40";
  if (st === "warn") return "bg-sam-warning-soft text-sam-warning border-sam-warning/40";
  if (st === "fail") return "bg-sam-danger-soft text-sam-danger border-sam-danger/40";
  return "bg-sam-surface-muted text-sam-muted border-sam-border";
}

function overallClass(o: string | undefined): string {
  if (o === "READY") return "text-sam-success";
  if (o === "BLOCKED") return "text-sam-danger";
  return "text-sam-warning";
}

export function AdminDeliveryReleaseGatePage() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [errStatus, setErrStatus] = useState<number | undefined>(undefined);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [data, setData] = useState<GatePayload | null>(null);
  /** 수동 점검 체크 = 최고관리자 (접근표 action · 서버 PATCH requireSuperAdmin) */
  const writeAction = useAdminRouteAction("/admin/delivery-release-gate");

  const load = useCallback(async () => {
    setErr(null);
    setErrStatus(undefined);
    try {
      const r = await fetch("/api/admin/delivery-release-gate", { cache: "no-store" });
      const j = (await r.json().catch(() => null)) as GatePayload | null;
      if (!r.ok || !j?.ok) {
        setErr(errCode(r.status, j, "load_failed"));
        setErrStatus(r.status);
        /** 갱신 실패 시 직전 정상 판정은 유지 (지시서 §8-5) — 힌트만 갱신. */
        setData((prev) => (prev?.gate ? { ...prev, hint: j?.hint } : j));
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
      await load();
      if (alive) setLoading(false);
    })();
    const t = window.setInterval(() => {
      if (busyKey) return;
      void load();
    }, 30_000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [load, busyKey]);

  const gate = data?.gate;
  const items = gate?.items ?? [];
  const manual = gate?.manual ?? [];
  const overall = gate?.overall ?? "WARNING";

  const sortedItems = useMemo(() => {
    const rank = (s: GateStatus) => (s === "fail" ? 3 : s === "warn" ? 2 : s === "needs_check" ? 1 : 0);
    return [...items].sort((a, b) => rank(b.status) - rank(a.status));
  }, [items]);

  const onToggleManual = async (key: string, checked: boolean, note: string | null) => {
    if (busyKey || !writeAction.allowed) return;
    setBusyKey(key);
    setSaveErr(null);
    try {
      const r = await fetch("/api/admin/delivery-release-gate", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, checked, note }),
      });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!r.ok || !j?.ok) throw new Error(errCode(r.status, j, "update_failed"));
      await load();
    } catch (e) {
      setSaveErr(e instanceof Error && /^[a-z][a-z0-9_]*$/i.test(e.message) ? e.message : "network_error");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className={`${Sam.page} bg-sam-app min-h-[75vh] px-4 py-8`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-sam-fg">{t("admin_menu_delivery_release_gate")}</h1>
          <p className="mt-1 text-sm text-sam-muted">
            {t("admin_delivery_gate_subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <AdminActionLink href="/admin/ops-console" variant="secondary">
            {ko ? "운영 콘솔" : "Ops console"}
          </AdminActionLink>
          <AdminActionLink href="/admin/runtime-health" variant="secondary">
            {ko ? "런타임 상태" : "Runtime health"}
          </AdminActionLink>
          <AdminActionButton variant="secondary" onClick={() => void load()} disabled={!!busyKey}>
            {adminCta("refresh", ko)}
          </AdminActionButton>
        </div>
      </div>

      {!writeAction.allowed && writeAction.reason ? (
        <p data-admin-action-denied="1" className="mt-3 sam-text-helper text-sam-muted">
          {ko ? `수동 점검 체크 비활성: ${writeAction.reason}` : `Manual checks disabled: ${writeAction.reason}`}
        </p>
      ) : null}

      <div className={`mt-6 ${Sam.card.base} ${Sam.card.pad}`}>
        <div className="text-sm text-sam-muted">{ko ? "전체 판정" : "Overall"}</div>
        <div className={`mt-1 text-[20px] font-semibold ${overallClass(overall)}`}>
          {OVERALL_LABELS[overall] ? (ko ? OVERALL_LABELS[overall].ko : OVERALL_LABELS[overall].en) : overall}
        </div>
        <div className="mt-2 text-xs text-sam-muted">
          {ko ? "확인 시각" : "Generated at"}: {fmtTs(data?.generated_at)}
        </div>
      </div>

      {loading ? (
        <div className="mt-6">
          <AdminLoadingState ko={ko} label={t("common_loading")} />
        </div>
      ) : null}
      {err ? (
        <div className="mt-6">
          <AdminErrorState ko={ko} code={err} httpStatus={errStatus} onRetry={() => void load()} />
          {data?.hint ? <AdminTechDetails ko={ko}>{data.hint}</AdminTechDetails> : null}
        </div>
      ) : null}
      {saveErr ? (
        <div className="mt-6">
          <AdminResultBanner ko={ko} result={{ ok: false, code: saveErr }} onClose={() => setSaveErr(null)} />
        </div>
      ) : null}

      <div className={`mt-6 ${Sam.card.base} ${Sam.card.pad}`}>
        <div className="font-medium text-sam-fg">{t("admin_delivery_gate_auto_checks")}</div>
        <div className="mt-3 space-y-3">
          {sortedItems.length === 0 ? (
            gate ? <AdminEmptyState ko={ko} message={t("admin_delivery_gate_no_items")} /> : null
          ) : (
            sortedItems.map((it) => (
              <div key={it.key} className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-sam-fg">{it.title}</div>
                    <div className="mt-1 text-xs text-sam-muted break-all">{it.description}</div>
                    <div className="mt-1 text-xs text-sam-muted">
                      {ko ? "조치 방법" : "How"}: {it.howTo}
                    </div>
                    {it.checked_at ? (
                      <div className="mt-1 text-xs text-sam-muted">
                        {ko ? "확인 시각" : "Checked at"}: {fmtTs(it.checked_at)}
                      </div>
                    ) : null}
                  </div>
                  <div className={`shrink-0 rounded-ui-rect border px-2 py-1 text-xs font-medium ${badgeClass(it.status)}`}>
                    {STATUS_LABELS[it.status] ? (ko ? STATUS_LABELS[it.status].ko : STATUS_LABELS[it.status].en) : it.status}
                  </div>
                </div>
                {it.links?.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {it.links.map((l) => (
                      <AdminActionLink key={l.href + l.label} href={l.href} variant="secondary" size="sm">
                        {LINK_LABELS[l.href] ? (ko ? LINK_LABELS[l.href].ko : LINK_LABELS[l.href].en) : l.label}
                      </AdminActionLink>
                    ))}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>

      <div className={`mt-6 ${Sam.card.base} ${Sam.card.pad}`}>
        <div className="font-medium text-sam-fg">{t("admin_delivery_gate_manual_checks")}</div>
        <div className="mt-3 space-y-3">
          {manual.length === 0 ? (
            gate ? <AdminEmptyState ko={ko} message={t("admin_delivery_gate_manual_empty")} /> : null
          ) : (
            manual.map((m) => (
              <div key={m.key} className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-sm text-sam-fg">
                    <input
                      type="checkbox"
                      checked={m.checked}
                      disabled={busyKey === m.key || !writeAction.allowed}
                      onChange={(e) => void onToggleManual(m.key, e.target.checked, m.note)}
                    />
                    {m.label}
                  </label>
                  <div className="text-xs text-sam-muted">
                    {m.checked_at
                      ? `${ko ? "확인 시각" : "Checked at"}: ${fmtTs(m.checked_at)}`
                      : t("admin_delivery_gate_unchecked")}
                  </div>
                </div>
                <div className="mt-2">
                  <input
                    className="w-full rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 text-sm"
                    placeholder={t("admin_delivery_gate_memo_placeholder")}
                    defaultValue={m.note ?? ""}
                    onBlur={(e) => {
                      const next = e.target.value.trim();
                      if (next === (m.note ?? "")) return;
                      void onToggleManual(m.key, m.checked, next || null);
                    }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

