"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { FinanceAdminNav } from "@/components/finance/FinanceAdminNav";
import { AdminActionConfirmDialog } from "@/components/admin/ui/AdminActionConfirmDialog";
import type { CoinCashConversionPolicy } from "@/lib/finance/conversion-policy";

export function AdminFinanceSettingsView() {
  const { language } = useI18n();
  const ko = language !== "en";
  const [policy, setPolicy] = useState<CoinCashConversionPolicy | null>(null);
  const [draft, setDraft] = useState<Partial<CoinCashConversionPolicy>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/finance/conversion-policy", {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as {
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
      setError("network");
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

  const save = async () => {
    setPending(true);
    try {
      const res = await fetch("/api/admin/finance/conversion-policy", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        policy?: CoinCashConversionPolicy;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.policy) {
        setError(json.error || "save_failed");
        return;
      }
      setPolicy(json.policy);
      setDraft(json.policy);
      setConfirmOpen(false);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-4" data-admin-finance-settings="1">
      <FinanceAdminNav ko={ko} />
      <h2 className="text-lg font-semibold">{ko ? "재무 설정 · Coin→Cash 전환 정책" : "Finance settings · Coin→Cash"}</h2>
      <p className="sam-text-helper text-sam-muted">
        {ko
          ? "전환 ≠ 출금. Cash 출금은 없습니다. 변경은 이후 전환부터 적용됩니다."
          : "Conversion ≠ withdrawal. Cash withdrawal does not exist. Changes apply to future conversions only."}
      </p>
      {loading ? <p className="text-sam-muted">{ko ? "불러오는 중…" : "Loading…"}</p> : null}
      {error ? <p className="text-amber-900">{error}</p> : null}
      {policy ? (
        <div className="max-w-xl space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
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
          <button
            type="button"
            disabled={!dirty || pending}
            className="rounded-ui-rect bg-signature px-4 py-2 font-semibold text-white disabled:opacity-40"
            onClick={() => setConfirmOpen(true)}
            data-finance-cta="save-conversion-policy"
          >
            {ko ? "전환 정책 저장" : "Save conversion policy"}
          </button>
        </div>
      ) : null}

      <AdminActionConfirmDialog
        open={confirmOpen}
        title={ko ? "Coin→Cash 전환 정책을 변경하시겠습니까?" : "Change Coin→Cash conversion policy?"}
        description={
          ko
            ? `현재 v${policy?.version ?? "—"} → 새 설정이 이후 전환부터 적용됩니다. 과거 원장에는 소급되지 않습니다.`
            : `Current v${policy?.version ?? "—"} → new settings apply to future conversions only.`
        }
        confirmLabel={ko ? "정책 변경" : "Change policy"}
        cancelLabel={ko ? "취소" : "Cancel"}
        pending={pending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void save()}
      />
    </div>
  );
}
