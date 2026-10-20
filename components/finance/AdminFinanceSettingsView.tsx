"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { FinanceAdminNav } from "@/components/finance/FinanceAdminNav";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import type { CoinCashConversionPolicy } from "@/lib/finance/conversion-policy";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminStatusLabel } from "@/components/admin/ui/AdminStatusLabel";
import {
  AdminErrorState,
  AdminLoadingState,
  AdminResultBanner,
} from "@/components/admin/ui/AdminStateViews";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { FINANCE_ACTIVE_STATE_NS } from "@/lib/admin/status-labels/finance-status-labels";

export function AdminFinanceSettingsView() {
  const { language } = useI18n();
  const ko = language !== "en";
  const [policy, setPolicy] = useState<CoinCashConversionPolicy | null>(null);
  const [draft, setDraft] = useState<Partial<CoinCashConversionPolicy>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: true; message: string } | { ok: false; code: string } | null>(null);
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/finance/conversion-policy", {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        policy?: CoinCashConversionPolicy;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.policy) {
        setError(json.error || "load_failed");
        return;
      }
      setPolicy(json.policy);
      setDraft(json.policy);
    } catch {
      setError("network_error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty =
    !!policy &&
    (draft.enabled !== policy.enabled ||
      draft.ratePesosPerPoint !== policy.ratePesosPerPoint ||
      draft.minimumCoin !== policy.minimumCoin ||
      draft.conversionUnit !== policy.conversionUnit ||
      draft.maximumConversionsPerDay !== policy.maximumConversionsPerDay ||
      draft.maximumConversionsPerWeek !== policy.maximumConversionsPerWeek ||
      draft.maximumConversionsPerMonth !== policy.maximumConversionsPerMonth ||
      draft.minimumIntervalHours !== policy.minimumIntervalHours ||
      draft.dailyLimitCoin !== policy.dailyLimitCoin ||
      draft.monthlyLimitCoin !== policy.monthlyLimitCoin);

  /** 전환 정책 저장 = pointPolicySave(L2): 확인 + 사유, 사유는 API 로 보내 감사 기록에 남긴다. */
  const requestSave = async () => {
    const c = await confirmAdminAction({
      level: adminActionLevel("pointPolicySave"),
      ko,
      title: ko ? "Coin→Cash 전환 정책을 변경하시겠습니까?" : "Change Coin→Cash conversion policy?",
      description: ko
        ? `현재 v${policy?.version ?? "—"} → 새 설정이 이후 전환부터 적용됩니다. 과거 원장에는 소급되지 않습니다.`
        : `Current v${policy?.version ?? "—"} → new settings apply to future conversions only.`,
      confirmLabel: adminCta("save", ko),
    });
    if (!c.ok || !c.reason) return;
    await save(c.reason);
  };

  const save = async (reason: string) => {
    setPending(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/finance/conversion-policy", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, reason }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        policy?: CoinCashConversionPolicy;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.policy) {
        setResult({ ok: false, code: json.error || "save_failed" });
        return;
      }
      setPolicy(json.policy);
      setDraft(json.policy);
      setResult({ ok: true, message: ko ? "전환 정책을 저장했습니다." : "Conversion policy saved." });
    } catch {
      setResult({ ok: false, code: "network_error" });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-4" data-admin-finance-settings="1">
      <FinanceAdminNav ko={ko} />
      <h2 className="text-[16px] font-semibold text-sam-fg">{ko ? "재무 설정 · Coin→Cash 전환 정책" : "Finance settings · Coin→Cash"}</h2>
      <p className="sam-text-helper text-sam-muted">
        {ko
          ? "전환 ≠ 출금. Cash 출금은 없습니다. 변경은 이후 전환부터 적용됩니다."
          : "Conversion ≠ withdrawal. Cash withdrawal does not exist. Changes apply to future conversions only."}
      </p>
      {loading ? <AdminLoadingState ko={ko} /> : null}
      {error ? <AdminErrorState ko={ko} code={error} onRetry={() => void load()} /> : null}
      {result ? <AdminResultBanner ko={ko} result={result} onClose={() => setResult(null)} /> : null}
      {policy ? (
        <div className="grid max-w-4xl gap-4 lg:grid-cols-2">
          <div
            className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-app p-4"
            data-finance-policy-current="1"
          >
            <h3 className="font-semibold">{ko ? "현재 정책" : "Current policy"}</h3>
            <dl className="space-y-1 sam-text-body-secondary">
              <div className="flex justify-between gap-2">
                <dt className="text-sam-muted">enabled</dt>
                <dd>
                  <AdminStatusLabel
                    namespace={FINANCE_ACTIVE_STATE_NS}
                    code={policy.enabled ? "active" : "inactive"}
                    ko={ko}
                  />
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-sam-muted">rate</dt>
                <dd>1 Coin = ₱{policy.ratePesosPerPoint}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-sam-muted">minimum</dt>
                <dd>{policy.minimumCoin}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-sam-muted">unit</dt>
                <dd>{policy.conversionUnit}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-sam-muted">day / week / month count</dt>
                <dd>
                  {policy.maximumConversionsPerDay ?? "—"} / {policy.maximumConversionsPerWeek ?? "—"} /{" "}
                  {policy.maximumConversionsPerMonth ?? "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-sam-muted">interval (h)</dt>
                <dd>{policy.minimumIntervalHours ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-sam-muted">daily / monthly Coin cap</dt>
                <dd>
                  {policy.dailyLimitCoin ?? "—"} / {policy.monthlyLimitCoin ?? "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-sam-muted">version / effective</dt>
                <dd>
                  v{policy.version}
                  {policy.effectiveFrom
                    ? ` · ${formatAdminManilaDateTime(policy.effectiveFrom)}`
                    : ""}
                </dd>
              </div>
            </dl>
          </div>

          <div className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4" data-finance-policy-edit="1">
            <h3 className="font-semibold">{ko ? "변경값" : "Draft changes"}</h3>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.enabled !== false}
              onChange={(e) => setDraft((d) => ({ ...d, enabled: e.target.checked }))}
            />
            {ko ? "전환 사용" : "Conversion enabled"}
          </label>
          {(
            [
              ["ratePesosPerPoint", ko ? "비율 (1 Coin = PHP)" : "Rate"],
              ["minimumCoin", ko ? "최소 Coin" : "Minimum Coin"],
              ["conversionUnit", ko ? "전환 단위" : "Conversion unit"],
              ["maximumConversionsPerDay", ko ? "일 횟수 한도" : "Daily count limit"],
              ["maximumConversionsPerWeek", ko ? "주 횟수 한도" : "Weekly count limit"],
              ["maximumConversionsPerMonth", ko ? "월 횟수 한도" : "Monthly count limit"],
              ["minimumIntervalHours", ko ? "최소 간격(시간)" : "Min interval (hours)"],
              ["dailyLimitCoin", ko ? "일 Coin 한도" : "Daily Coin cap"],
              ["monthlyLimitCoin", ko ? "월 Coin 한도" : "Monthly Coin cap"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block">
              <span className="sam-text-helper text-sam-muted">{label}</span>
              <input
                type="number"
                className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2"
                value={draft[key] == null || Number.isNaN(Number(draft[key])) ? "" : String(draft[key])}
                onChange={(e) => {
                  const raw = e.target.value;
                  setDraft((d) => ({ ...d, [key]: raw === "" ? null : Number(raw) }));
                }}
              />
            </label>
          ))}
          <div className="flex justify-end">
            <AdminActionButton
              variant="primary"
              disabled={!dirty || pending}
              onClick={() => void requestSave()}
              data-finance-cta="save-conversion-policy"
            >
              {ko ? "전환 정책 저장" : "Save conversion policy"}
            </AdminActionButton>
          </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
