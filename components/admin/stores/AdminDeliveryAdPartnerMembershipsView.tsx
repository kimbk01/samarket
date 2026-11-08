"use client";

import { AdminChipButton } from "@/components/admin/ui/AdminChipButton";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AdminDeliveryCmsChrome } from "@/components/admin/shell/AdminDeliveryCmsChrome";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminDeliveryAdsSectionNav } from "@/components/admin/stores/AdminDeliveryAdsSectionNav";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { adminFetch } from "@/lib/admin/admin-fetch-client";
import {
  AdminDeliveryAdPartnerConfigForm,
  useAdminPartnerCatalogConfig,
} from "@/components/admin/stores/AdminDeliveryAdPartnerConfigForm";
import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import { supportInboxHrefForStore } from "@/lib/support/support-reference-admin-href";
import { emitAdminQueueChanged } from "@/lib/admin/admin-queue-events";
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { formatAdminManilaDate } from "@/lib/admin/metrics/manila-period";
import { AdminErrorState } from "@/components/admin/ui/AdminStateViews";
import { translateBy } from "@/lib/i18n/translate-by";

type MembershipRow = {
  id: string;
  storeId: string;
  storeName: string | null;
  status: string;
  statusLabelKo: string;
  statusLabelEn: string;
  periodStart: string | null;
  periodEnd: string | null;
  feeSnapshotLabel: string | null;
  advertisingDiscountPercentSnapshot: number;
  cancelRequestedAt: string | null;
  periodExpired?: boolean;
};

/** ADS-04 — partner Cash funding with no membership row (expected 0). */
type OrphanFundingRow = {
  fundingId: string;
  applicationId: string;
  storeId: string;
  status: string;
  amountLabel: string;
  securedAt: string | null;
};

/**
 * Partner 관리 — operational page with clear header nav + filter hierarchy.
 */
export function AdminDeliveryAdPartnerMembershipsView() {
  const { language, safeT } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const searchParams = useSearchParams();
  const focusMembershipId = (searchParams.get("membershipId") ?? "").trim();
  const partnerCatalog = useAdminPartnerCatalogConfig();
  const [items, setItems] = useState<MembershipRow[]>([]);
  const [orphanFundings, setOrphanFundings] = useState<OrphanFundingRow[]>([]);
  const [filter, setFilter] = useState<
    | "open"
    | "PENDING_REVIEW"
    | "ACTIVE"
    | "CANCEL_PENDING"
    | "REJECTED"
    | "ENDED"
    | "all"
  >(() => {
    const s = (searchParams.get("status") ?? "").trim();
    if (
      s === "PENDING_REVIEW" ||
      s === "ACTIVE" ||
      s === "CANCEL_PENDING" ||
      s === "REJECTED" ||
      s === "ENDED" ||
      s === "all" ||
      s === "open"
    ) {
      return s;
    }
    return focusMembershipId ? "PENDING_REVIEW" : "open";
  });
  const [error, setError] = useState<string | null>(null);
  /** v4 UI-11 — 목록 조회 실패는 처리 실패와 구분해 오류 상태 + 다시 불러오기 */
  const [loadError, setLoadError] = useState<{ code: string; status?: number } | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void partnerCatalog.load();
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    setListLoading(true);
    try {
      const res = await adminFetch(
        `/api/admin/delivery-ads/partner/memberships?status=${encodeURIComponent(filter)}`,
        { credentials: "include", cache: "no-store" }
      );
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        memberships?: MembershipRow[];
        orphanFundings?: OrphanFundingRow[];
        error?: string;
      };
      if (!res.ok || !j.ok) {
        setLoadError({ code: j.error ?? "load_failed", status: res.status });
        setItems([]);
        setOrphanFundings([]);
        return;
      }
      setItems(j.memberships ?? []);
      setOrphanFundings(j.orphanFundings ?? []);
    } catch {
      setLoadError({ code: "network_error" });
      setItems([]);
      setOrphanFundings([]);
    } finally {
      setListLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!focusMembershipId || items.length === 0) return;
    const el = document.querySelector(
      `[data-admin-partner-membership-row="${CSS.escape(focusMembershipId)}"]`
    );
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.setAttribute("data-admin-partner-membership-focus", "1");
      el.classList.add("ring-2", "ring-signature");
    }
  }, [focusMembershipId, items]);

  const act = async (op: "approve" | "reject" | "end", membershipId: string, storeLabel: string) => {
    if (busy) return;
    // v4 UI-11 — 승인·반려·종료는 확인 후 실행
    const ko = lang !== "en";
    const copy = {
      approve: { ko: "Partner 가입을 승인할까요?", en: "Approve this Partner membership?", cta: ko ? "승인" : "Approve" },
      reject: { ko: "Partner 가입을 반려할까요?", en: "Reject this Partner membership?", cta: ko ? "반려" : "Reject" },
      end: { ko: "Partner 멤버십을 종료할까요?", en: "End this Partner membership?", cta: ko ? "종료" : "End" },
    }[op];
    // 승인·반려 = 매장 금전 영향(L2 · 사유를 API 로 전송), 종료 = 사용 끄기(L1)
    const confirmed = await confirmAdminAction({
      level: adminActionLevel(op === "approve" ? "approve" : op === "reject" ? "reject" : "disable"),
      ko,
      title: ko ? copy.ko : copy.en,
      description: `${ko ? "매장" : "Store"}: ${storeLabel}`,
      confirmLabel: copy.cta,
      destructive: op !== "approve",
    });
    if (!confirmed.ok) return;
    setBusy(true);
    setError(null);
    try {
      const res = await adminFetch("/api/admin/delivery-ads/partner/memberships", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op,
          membershipId,
          reason:
            confirmed.reason ??
            (op === "approve"
              ? "admin_partner_approve"
              : op === "reject"
                ? "admin_partner_reject"
                : "admin_partner_end"),
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setError(j.error ?? "action_failed");
        return;
      }
      emitAdminQueueChanged("partner_pending");
      await load();
    } catch {
      setError("network_error");
    } finally {
      setBusy(false);
    }
  };

  const filters = [
    ["open", "open", "진행 중", "In progress"],
    ["PENDING_REVIEW", "pending", "가입 대기", "Pending"],
    ["ACTIVE", "active", "이용 중", "Active"],
    ["CANCEL_PENDING", "cancel", "해지 예정", "Cancel pending"],
    ["REJECTED", "rejected", "반려", "Rejected"],
    ["ENDED", "ended", "종료", "Ended"],
    ["all", "all", "전체", "All"],
  ] as const;

  return (
    <AdminDeliveryCmsChrome>
      <div className="space-y-4 pb-10" data-admin-partner-memberships="design-board">
        <div>
          <p className="text-[12px] text-sam-muted">Delivery › Ads › Partner</p>
          <h1 className="text-[20px] font-bold text-sam-fg">
            {safeT("admin_delivery_ads_partner_manage_title")}
          </h1>
          <p className="mt-1 text-[13px] text-sam-muted">
            {safeT("admin_delivery_ads_partner_manage_desc")}
          </p>
        </div>

        <AdminDeliveryAdsSectionNav />

        <p
          className="rounded-ui-rect border border-sam-warning bg-sam-warning-soft px-3 py-2 text-[12px] text-sam-warning"
          data-partner-payment="NOT_IMPLEMENTED"
        >
          {safeT("admin_delivery_ads_partner_payment_note")}
        </p>

        <AdminCard
          title={
            translateBy(lang, "admin_partner_operating_settings")
          }
        >
          <p className="mb-3 text-[12px] text-sam-muted">
            {safeT("admin_delivery_ads_commercial_partner_note")}
          </p>
          {partnerCatalog.error && !partnerCatalog.catalog ? (
            <AdminErrorState
              ko={lang !== "en"}
              code={partnerCatalog.error}
              onRetry={() => void partnerCatalog.load()}
            />
          ) : partnerCatalog.catalog ? (
            <AdminDeliveryAdPartnerConfigForm
              config={partnerCatalog.catalog.partnerConfig}
              busy={partnerCatalog.busy}
              lang={lang}
              onSave={(body) => void partnerCatalog.savePartner(body)}
            />
          ) : (
            <p className="text-[13px] text-sam-muted">
              {safeT("admin_delivery_ads_loading")}
            </p>
          )}
          {partnerCatalog.error && partnerCatalog.catalog ? (
            <p className="mt-2 text-[12px] text-sam-danger" role="alert">
              {adminOperatorErrorMessage(partnerCatalog.error, lang !== "en")}
            </p>
          ) : null}
        </AdminCard>

        {error ? (
          <p className="text-[13px] text-sam-danger" role="alert">
            {adminOperatorErrorMessage(error, lang !== "en")}
          </p>
        ) : null}

        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label={
            translateBy(lang, "admin_membership_status_filters")
          }
          data-admin-partner-filters="1"
        >
          {filters.map(([value, key, ko, en]) => {
            const selected = filter === value;
            return (
              <AdminChipButton selected={selected}
                key={value}
                onClick={() => setFilter(value)}
                data-partner-filter={key}
                data-selected={selected ? "1" : "0"}
              >
                {safeT(`admin_delivery_ads_partner_filter_${key}` as "admin_delivery_ads_partner_filter_open", {
                  fallbackKo: ko,
                  fallbackEn: en,
                })}
              </AdminChipButton>
            );
          })}
        </div>

        {orphanFundings.length > 0 ? (
          <AdminCard
            title={
              translateBy(lang, "admin_partner_fee_without_membership_manual_check")
            }
          >
            <ul className="space-y-1 text-[12px] text-sam-fg" data-admin-partner-orphan-fundings="1">
              {orphanFundings.map((f) => (
                <li key={f.fundingId} data-admin-partner-orphan-funding={f.fundingId}>
                  <Link
                    href={`/admin/finance?storeId=${encodeURIComponent(f.storeId)}`}
                    className="text-sam-primary underline underline-offset-2"
                  >
                    {f.storeId}
                  </Link>{" "}
                  · {f.amountLabel} · {f.status} · {formatAdminManilaDate(f.securedAt)} PHT
                </li>
              ))}
            </ul>
          </AdminCard>
        ) : null}

        <AdminCard
          title={translateBy(lang, "admin_partner_memberships")}
        >
          {loadError ? (
            <AdminErrorState
              ko={lang !== "en"}
              code={loadError.code}
              httpStatus={loadError.status}
              onRetry={() => void load()}
            />
          ) : listLoading && items.length === 0 ? (
            <p className="text-[13px] text-sam-muted" data-admin-partner-loading="1">
              {safeT("admin_delivery_ads_loading")}
            </p>
          ) : items.length === 0 ? (
            <p className="text-[13px] text-sam-muted" data-admin-partner-empty="1">
              {safeT("admin_delivery_ads_partner_empty")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table
                className="w-full min-w-[560px] border-collapse text-[12px]"
                data-admin-partner-memberships-table="design-board"
              >
                <thead>
                  <tr className="bg-sam-app text-left text-sam-muted">
                    <th className="border border-sam-border p-2 font-semibold">
                      {safeT("admin_delivery_ads_partner_col_store")}
                    </th>
                    <th className="border border-sam-border p-2 font-semibold">
                      {safeT("admin_delivery_ads_partner_col_status")}
                    </th>
                    <th className="border border-sam-border p-2 font-semibold">
                      {safeT("admin_delivery_ads_partner_col_period")}
                    </th>
                    <th className="border border-sam-border p-2 font-semibold">
                      {safeT("admin_delivery_ads_partner_col_context")}
                    </th>
                    <th className="border border-sam-border p-2 font-semibold">
                      {safeT("admin_delivery_ads_queue_col_action")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((m) => (
                    <tr
                      key={m.id}
                      className="bg-white"
                      data-partner-membership-row={m.status}
                      data-admin-partner-membership-row={m.id}
                    >
                      <td className="border border-sam-border p-2 font-medium text-sam-fg">
                        <Link
                          href={`/admin/business/${encodeURIComponent(m.storeId)}`}
                          className="text-sam-primary underline underline-offset-2"
                          data-partner-store-link="1"
                        >
                          {m.storeName ?? m.storeId}
                        </Link>
                      </td>
                      <td className="border border-sam-border p-2 text-sam-fg">
                        {lang === "en" ? m.statusLabelEn : m.statusLabelKo}
                        {m.advertisingDiscountPercentSnapshot > 0 ? (
                          <p className="mt-1 text-[12px] text-sam-muted">
                            {safeT("admin_delivery_ads_partner_benefit_hint", { vars: { percent: m.advertisingDiscountPercentSnapshot } })}
                          </p>
                        ) : null}
                      </td>
                      <td className="border border-sam-border p-2 text-sam-muted">
                        {m.periodEnd
                          ? `${formatAdminManilaDate(m.periodStart)} ~ ${formatAdminManilaDate(m.periodEnd)} PHT`
                          : "—"}
                        {m.feeSnapshotLabel ? (
                          <p className="mt-1 text-[12px]">
                            {safeT("admin_delivery_ads_partner_fee_cash", { vars: { label: m.feeSnapshotLabel } })}
                          </p>
                        ) : null}
                      </td>
                      <td className="border border-sam-border p-2">
                        <div className="flex flex-wrap gap-2">
                          <Link
                            href={`/admin/finance?storeId=${encodeURIComponent(m.storeId)}`}
                            className="inline-flex min-h-[36px] items-center rounded-ui-rect border border-sam-border bg-white px-2 text-[12px] font-semibold text-sam-fg"
                            data-partner-finance-link="1"
                          >
                            {safeT("admin_delivery_ads_partner_open_finance")}
                          </Link>
                          <Link
                            href={`${DELIVERY_AD_ADMIN_ROUTES.hub}?storeId=${encodeURIComponent(m.storeId)}`}
                            className="inline-flex min-h-[36px] items-center rounded-ui-rect border border-sam-border bg-white px-2 text-[12px] font-semibold text-sam-fg"
                            data-partner-ads-link="1"
                          >
                            {safeT("admin_delivery_ads_partner_open_ads")}
                          </Link>
                          <Link
                            href={supportInboxHrefForStore(m.storeId)}
                            className="inline-flex min-h-[36px] items-center rounded-ui-rect border border-sam-border bg-white px-2 text-[12px] font-semibold text-sam-fg"
                            data-partner-support-link="1"
                          >
                            {safeT("admin_delivery_ads_partner_open_support")}
                          </Link>
                        </div>
                      </td>
                      <td className="border border-sam-border p-2">
                        <div className="flex flex-wrap gap-2">
                          {m.status === "PENDING_REVIEW" ? (
                            <>
                              <AdminActionButton variant="ghost" size="sm"
                                disabled={busy}
                                onClick={() => void act("approve", m.id, m.storeName ?? m.storeId)}
                                data-partner-approve="1"
                              >
                                {safeT("admin_delivery_ads_partner_approve")}
                              </AdminActionButton>
                              <AdminActionButton variant="ghost" size="sm"
                                disabled={busy}
                                onClick={() => void act("reject", m.id, m.storeName ?? m.storeId)}
                                data-partner-reject="1"
                              >
                                {safeT("admin_delivery_ads_partner_reject")}
                              </AdminActionButton>
                            </>
                          ) : null}
                          {m.status === "ACTIVE" || m.status === "CANCEL_PENDING" ? (
                            <AdminActionButton variant="ghost" size="sm"
                              disabled={busy}
                              onClick={() => void act("end", m.id, m.storeName ?? m.storeId)}
                              data-partner-end="1"
                            >
                              {safeT("admin_delivery_ads_partner_end")}
                            </AdminActionButton>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminCard>
      </div>
    </AdminDeliveryCmsChrome>
  );
}
