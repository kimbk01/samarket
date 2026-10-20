"use client";

import { useCallback, useEffect, useState } from "react";
import { adminSafeErrorCode, type AdminLoadFailure } from "@/lib/admin/admin-load-failure";
import {
  AdminErrorState,
  AdminLoadingState,
  AdminResultBanner,
} from "@/components/admin/ui/AdminStateViews";
import { logAdminMutation } from "@/lib/admin/admin-perf-logger";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";

export function OpsTradePolicyPanel() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [autoDays, setAutoDays] = useState(7);
  const [reviewDays, setReviewDays] = useState(14);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadErr, setLoadErr] = useState<AdminLoadFailure | null>(null);
  const [result, setResult] = useState<{ ok: true; message: string } | { ok: false; code: string } | null>(null);

  /** 조회 실패를 기본값(7·14일)으로 숨기지 않는다 — 실패면 오류 상태 + [새로고침] (R6). */
  const fetchPolicy = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/ops-trade-policy");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadErr({ code: adminSafeErrorCode(data?.error, "load_failed"), httpStatus: res.status });
        return;
      }
      setLoadErr(null);
      if (typeof data.buyerAutoConfirmDays === "number") {
        setAutoDays(data.buyerAutoConfirmDays);
        setReviewDays(data.buyerReviewDeadlineDays ?? 14);
      }
    } catch {
      setLoadErr({ code: "network_error" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPolicy();
  }, [fetchPolicy]);

  const reload = () => {
    setLoading(true);
    setResult(null);
    void fetchPolicy();
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setResult(null);
    logAdminMutation("ops-trade-policy:save", "start");
    try {
      const res = await fetch("/api/admin/ops-trade-policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerAutoConfirmDays: autoDays,
          buyerReviewDeadlineDays: reviewDays,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        logAdminMutation("ops-trade-policy:save", "fail", { status: res.status });
        setResult({ ok: false, code: res.status === 403 ? "forbidden" : adminSafeErrorCode(data?.error, "save_failed") });
        return;
      }
      logAdminMutation("ops-trade-policy:save", "success");
      setResult({ ok: true, message: t("admin_settings_trade_saved") });
    } catch {
      logAdminMutation("ops-trade-policy:save", "fail");
      setResult({ ok: false, code: "network_error" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="mt-8 border-t border-sam-border pt-6">
        <AdminLoadingState ko={ko} label={t("admin_settings_trade_loading")} />
      </div>
    );
  }
  if (loadErr) {
    return (
      <div className="mt-8 border-t border-sam-border pt-6">
        <AdminErrorState ko={ko} code={loadErr.code} httpStatus={loadErr.httpStatus} onRetry={reload} />
      </div>
    );
  }

  return (
    <div className="mt-8 border-t border-sam-border pt-6">
      <h3 className="sam-text-body font-semibold text-sam-fg">{t("admin_settings_trade_title")}</h3>
      <p className="mt-1 sam-text-helper text-sam-muted">{t("admin_settings_trade_desc")}</p>
      <div className="mt-4 grid max-w-md gap-4 sm:grid-cols-2">
        <div>
          <label className="block sam-text-body-secondary font-medium text-sam-fg">
            {t("admin_settings_trade_auto_confirm_days")}
          </label>
          <input
            type="number"
            min={1}
            max={365}
            value={autoDays}
            onChange={(e) => setAutoDays(Number(e.target.value))}
            className="mt-1 w-full rounded border border-sam-border px-3 py-2 sam-text-body"
          />
        </div>
        <div>
          <label className="block sam-text-body-secondary font-medium text-sam-fg">
            {t("admin_settings_trade_review_deadline_days")}
          </label>
          <input
            type="number"
            min={1}
            max={365}
            value={reviewDays}
            onChange={(e) => setReviewDays(Number(e.target.value))}
            className="mt-1 w-full rounded border border-sam-border px-3 py-2 sam-text-body"
          />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <AdminActionButton variant="primary" disabled={saving} onClick={() => void save()}>
          {t("admin_settings_trade_save")}
        </AdminActionButton>
      </div>
      {result ? (
        <div className="mt-3">
          <AdminResultBanner ko={ko} result={result} onClose={() => setResult(null)} />
        </div>
      ) : null}
    </div>
  );
}
