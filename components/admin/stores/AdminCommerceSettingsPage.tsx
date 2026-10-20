"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminErrorState, AdminLoadingState, AdminResultBanner } from "@/components/admin/ui/AdminStateViews";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { adminConflictReloadedCode } from "@/lib/admin/operator-ux/operator-labels";
import { isAdminConflictErrorCode } from "@/lib/admin/concurrency/admin-expected-updated-at";
import { useAdminRouteAction } from "@/components/admin/access/use-admin-route-access";

type Overridden = {
  store_auto_complete_days: boolean;
  store_settlement_fee_bp: boolean;
  store_settlement_delay_days: boolean;
};

/** 필드별 admin_settings 행 버전 (GET/PUT `settings_updated_at`) — 저장 시 expected_updated_at 으로 전송. */
type SettingsVersions = Record<string, string | null>;

/**
 * 커머스 기본값 — 자동 완료 일수만 편집한다.
 * C-9 · DUP-4 · DEF-4: 「정산 수수료(만분율)」(수수료 정책 SSOT)·「지급 예정일」(레거시 정산 writer 중단)은
 * 더 이상 적용되지 않으므로 숨기고 안내만 한다. 서버도 값 저장을 거부한다(null 정리만 허용).
 */
export function AdminCommerceSettingsPage() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  /** 쓰기(저장·기본값 복원) — 접근표 action perm("business"). 서버 가드는 그대로. */
  const action = useAdminRouteAction("/admin/commerce-settings");
  const [autoDays, setAutoDays] = useState("");
  const [overridden, setOverridden] = useState<Overridden | null>(null);
  const [versions, setVersions] = useState<SettingsVersions | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{ code: string; status?: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: true; message: string } | { ok: false; code: string } | null>(null);

  const applyResponse = (json: {
    effective?: { store_auto_complete_days?: number };
    overridden_in_db?: Overridden;
    settings_updated_at?: SettingsVersions | null;
  }) => {
    setAutoDays(String(json.effective?.store_auto_complete_days ?? ""));
    setOverridden((json.overridden_in_db as Overridden) ?? null);
    setVersions(json.settings_updated_at ?? null);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/commerce-settings", { credentials: "include", cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setLoadError({ code: typeof json?.error === "string" ? json.error : "load_failed", status: res.status });
        return;
      }
      applyResponse(json);
    } catch {
      setLoadError({ code: "network_error" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(partial: Record<string, number | string | null>, successMessage: string) {
    if (saving || !action.allowed) return;
    setSaving(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/commerce-settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...partial, expected_updated_at: versions ?? {} }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        const code = typeof json?.error === "string" ? json.error : res.status === 403 ? "forbidden" : "update_failed";
        if (isAdminConflictErrorCode(code) || code === "expected_updated_at_required") {
          // 다른 관리자가 먼저 저장 — 최신 값을 다시 불러온 뒤 안내.
          await load();
          setResult({ ok: false, code: adminConflictReloadedCode(code) });
          return;
        }
        setResult({ ok: false, code });
        return;
      }
      applyResponse(json);
      setResult({ ok: true, message: successMessage });
    } catch {
      setResult({ ok: false, code: "network_error" });
    } finally {
      setSaving(false);
    }
  }

  const sourceBadge = (inDb: boolean | undefined) =>
    inDb ? (
      <span className="text-signature">{t("admin_r4c_commerce_badge_custom")}</span>
    ) : (
      <span className="text-sam-meta">{t("admin_r4c_commerce_badge_default")}</span>
    );

  const legacyStored = Boolean(overridden?.store_settlement_fee_bp || overridden?.store_settlement_delay_days);

  return (
    <div className="max-w-lg space-y-6">
      <AdminPageHeader titleKey="admin_menu_commerce_settings" />
      <p className="sam-text-body-secondary text-sam-muted">
        {t("admin_stores_commerce_settings_desc_prefix")}{" "}
        <Link href="/admin/stores/application-settings" className="text-signature underline">
          {t("admin_stores_commerce_settings_link")}
        </Link>
        {t("admin_stores_commerce_settings_desc_suffix")}
      </p>
      {!action.allowed && action.reason ? (
        <p className="sam-text-helper text-sam-muted" data-admin-action-denied="1">
          {ko ? `저장·기본값 복원 버튼 비활성: ${action.reason}` : `Actions disabled: ${action.reason}`}
        </p>
      ) : null}
      <AdminResultBanner ko={ko} result={result} onClose={() => setResult(null)} />
      {loading ? (
        <AdminLoadingState ko={ko} />
      ) : loadError ? (
        <AdminErrorState ko={ko} code={loadError.code} httpStatus={loadError.status} onRetry={() => void load()} />
      ) : (
        <>
          <form
            className="space-y-5 rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm"
            onSubmit={(e) => {
              e.preventDefault();
              if (!action.allowed) return;
              void save({ store_auto_complete_days: Math.round(Number(autoDays)) }, t("admin_stores_saved"));
            }}
          >
            <label className="block">
              <span className="text-xs font-medium text-sam-fg">
                {t("admin_stores_commerce_auto_complete_days")} {sourceBadge(overridden?.store_auto_complete_days)}
              </span>
              <input
                type="number"
                min={1}
                max={90}
                required
                className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-sm"
                value={autoDays}
                onChange={(e) => setAutoDays(e.target.value)}
              />
              <span className="mt-0.5 block sam-text-xxs text-sam-meta">1~90</span>
            </label>
            <div className="flex flex-wrap gap-2">
              <AdminActionButton type="submit" variant="primary" disabled={saving || !action.allowed}>
                {saving ? t("admin_stores_saving") : t("common_save")}
              </AdminActionButton>
            </div>
          </form>

          <section
            data-legacy-commerce-fields="retired"
            className="space-y-1 rounded-ui-rect border border-sam-border-soft bg-sam-app p-4 sam-text-helper text-sam-muted"
          >
            <p className="font-medium text-sam-fg">{t("admin_r4c_commerce_retired_title")}</p>
            <p>{t("admin_r4c_commerce_retired_fee")}</p>
            <p>{t("admin_r4c_commerce_retired_delay")}</p>
            <Link href="/admin/store-fee-policies" className="text-signature underline">
              {t("admin_r4c_commerce_go_fee_policies")}
            </Link>
          </section>

          <div className="space-y-2 border-t border-sam-border-soft pt-4">
            <p className="sam-text-xxs text-sam-muted">
              {legacyStored ? t("admin_r4c_commerce_reset_desc_with_legacy") : t("admin_r4c_commerce_reset_desc")}
            </p>
            <AdminActionButton
              variant="secondary"
              size="sm"
              disabled={saving || !action.allowed}
              onClick={async () => {
                if (saving || !action.allowed) return;
                // DEF-46: L2 확인 + 사유 (작업 기록).
                const c = await confirmAdminAction({
                  level: adminActionLevel("approve"),
                  ko,
                  title: t("admin_r4c_commerce_reset_confirm_title"),
                  description: legacyStored
                    ? t("admin_r4c_commerce_reset_desc_with_legacy")
                    : t("admin_r4c_commerce_reset_desc"),
                  confirmLabel: t("admin_r4c_commerce_reset_cta"),
                  destructive: true,
                });
                if (!c.ok) return;
                void save(
                  {
                    store_auto_complete_days: null,
                    store_settlement_fee_bp: null,
                    store_settlement_delay_days: null,
                    reason: c.reason,
                  },
                  t("admin_r4c_commerce_reset_done")
                );
              }}
            >
              {t("admin_r4c_commerce_reset_cta")}
            </AdminActionButton>
          </div>
        </>
      )}
    </div>
  );
}
