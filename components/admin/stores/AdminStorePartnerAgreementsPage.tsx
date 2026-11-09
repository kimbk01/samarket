"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { adminStatusLabel } from "@/lib/admin/status-labels/delivery-status-labels";
import { formatAdminManilaDate, formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { AdminChipButton } from "@/components/admin/ui/AdminChipButton";
import { formatPartnerFeePercent } from "@/lib/stores/partner/store-partner-agreement-contract";
import {
  ADMIN_PARTNER_AGREEMENT_FILTERS,
  type AdminPartnerAgreementFilter,
  type AdminPartnerAgreementListRow,
} from "@/lib/stores/partner/admin-store-partner-agreements-model";
import type { MessageKey } from "@/lib/i18n/messages";

const FILTER_LABEL: Record<AdminPartnerAgreementFilter, MessageKey> = {
  pending: "admin_partner_filter_pending",
  approved: "admin_partner_filter_approved",
  reconsent: "admin_partner_filter_reconsent",
  all: "admin_partner_filter_all",
};

const TH = "whitespace-nowrap px-3 py-2 text-left text-[12px] font-semibold text-sam-muted";
const TD = "align-top whitespace-nowrap px-3 py-2.5 text-[13px] text-sam-fg";

/** 정책 종료 시각(다음날 00:00 PHT) → 마지막 무료 날짜 (PHT) */
function manilaDateBeforeEnd(iso: string | null): string {
  const ms = Date.parse(String(iso ?? ""));
  if (!Number.isFinite(ms)) return "—";
  return formatAdminManilaDate(new Date(ms - 1));
}

/**
 * 어드민 「매장 입점 계약」 (`/admin/stores/partner-agreements`) — 설계 v2 §4-5. 조회 전용.
 * 필터: 승인 대기 / 승인 / 재동의 필요 / 전체 · 실매장만.
 */
export function AdminStorePartnerAgreementsPage() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [filter, setFilter] = useState<AdminPartnerAgreementFilter>("pending");
  const [rows, setRows] = useState<AdminPartnerAgreementListRow[]>([]);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | undefined>(undefined);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await fetch(
          `/api/admin/stores/partner-agreements?filter=${filter}&lang=${ko ? "ko" : "en"}`,
          { credentials: "include", cache: "no-store" }
        );
        const json = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          rows?: AdminPartnerAgreementListRow[];
          currentVersion?: string | null;
          truncated?: boolean;
        } | null;
        if (cancelled) return;
        if (!res.ok || !json?.ok) {
          setError(json?.error ?? "load_failed");
          setErrorStatus(res.status);
          return;
        }
        setRows(json.rows ?? []);
        setCurrentVersion(json.currentVersion ?? null);
        setTruncated(json.truncated === true);
      } catch {
        if (!cancelled) setError("network_error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filter, ko, reloadKey]);

  const reload = useCallback(() => setReloadKey((n) => n + 1), []);

  return (
    <div className="space-y-4" data-admin-store-partner-agreements="1">
      <AdminPageHeader titleKey="admin_partner_page_title" descriptionKey="admin_partner_page_desc" />
      <div className="flex flex-wrap items-center gap-2">
        {ADMIN_PARTNER_AGREEMENT_FILTERS.map((f) => (
          <AdminChipButton key={f} selected={filter === f} onClick={() => setFilter(f)}>
            {t(FILTER_LABEL[f])}
          </AdminChipButton>
        ))}
        <span className="text-[12px] text-sam-muted">
          {currentVersion
            ? t("admin_partner_current_version", { version: currentVersion })
            : t("admin_partner_no_published")}
        </span>
      </div>
      {truncated ? (
        <p className="text-[12px] text-sam-muted">{t("admin_partner_truncated", { count: 500 })}</p>
      ) : null}
      {loading ? (
        <AdminLoadingState ko={ko} label={t("admin_dashboard_loading")} />
      ) : error ? (
        <AdminErrorState ko={ko} code={error} httpStatus={errorStatus} onRetry={reload} />
      ) : rows.length === 0 ? (
        <AdminEmptyState ko={ko} message={t("admin_partner_empty")} />
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="min-w-full divide-y divide-sam-border-soft">
            <thead>
              <tr>
                <th className={TH}>{t("admin_partner_col_store")}</th>
                <th className={TH}>{t("admin_partner_col_owner")}</th>
                <th className={TH}>{t("admin_partner_col_category")}</th>
                <th className={TH}>{t("admin_partner_col_version")}</th>
                <th className={TH}>{t("admin_partner_col_agreed_at")}</th>
                <th className={TH}>{t("admin_partner_col_free_until")}</th>
                <th className={TH}>{t("admin_partner_col_fee_after")}</th>
                <th className={TH}>{t("admin_partner_col_launch_policy")}</th>
                <th className={TH}>{t("admin_partner_col_review")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sam-border-soft">
              {rows.map((r) => {
                const review = adminStatusLabel("store_approval", r.approvalStatus, ko);
                const pct = formatPartnerFeePercent(r.feePercentAfter);
                return (
                  <tr key={r.storeId}>
                    <td className={TD}>
                      <Link
                        href={`/admin/stores?q=${encodeURIComponent(r.storeName)}`}
                        className="font-medium text-sam-primary underline"
                      >
                        {r.storeName || "—"}
                      </Link>
                    </td>
                    <td className={TD}>{r.ownerLabel || "—"}</td>
                    <td className={TD}>{[r.categoryName, r.topicName].filter(Boolean).join(" · ") || "—"}</td>
                    <td className={TD}>
                      {r.latestVersion ? (
                        <span className="inline-flex items-center gap-1.5">
                          {r.latestVersion}
                          {!r.agreedCurrentVersion ? (
                            <AdminToneBadge tone="warning">{t("admin_partner_needs_reconsent_badge")}</AdminToneBadge>
                          ) : null}
                        </span>
                      ) : (
                        <AdminToneBadge tone={currentVersion ? "warning" : "neutral"}>
                          {t("admin_partner_no_agreement")}
                        </AdminToneBadge>
                      )}
                    </td>
                    <td className={TD}>{r.latestAgreedAt ? formatAdminManilaDateTime(r.latestAgreedAt) : "—"}</td>
                    <td className={TD}>
                      {r.agreedFreeUntil ?? "—"}
                      {r.overrideFreeUntil ? (
                        <span className="ml-1.5 text-[12px] text-sam-warning">
                          {t("admin_partner_override_badge", { date: r.overrideFreeUntil })}
                        </span>
                      ) : null}
                    </td>
                    <td className={TD}>{pct ? `${pct}%` : "—"}</td>
                    <td className={TD}>
                      {r.launchPolicyState === "policy"
                        ? t("admin_partner_policy_until", { date: manilaDateBeforeEnd(r.launchPolicyEndsAt) })
                        : r.launchPolicyState === "on_approval"
                          ? t("admin_partner_on_approval")
                          : t("admin_partner_none")}
                    </td>
                    <td className={TD}>
                      <AdminToneBadge tone={review.tone}>{review.label}</AdminToneBadge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
