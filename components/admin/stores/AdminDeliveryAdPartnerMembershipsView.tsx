"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminDeliveryCmsChrome } from "@/components/admin/shell/AdminDeliveryCmsChrome";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminDeliveryAdsSectionNav } from "@/components/admin/stores/AdminDeliveryAdsSectionNav";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { adminFetch } from "@/lib/admin/admin-fetch-client";
import {
  AdminDeliveryAdPartnerConfigForm,
  useAdminPartnerCatalogConfig,
} from "@/components/admin/stores/AdminDeliveryAdPartnerConfigForm";

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
};

const FILTER_BTN =
  "inline-flex min-h-[40px] items-center rounded-ui-rect border px-3 text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A823E]/40 active:scale-[0.99]";

/**
 * Partner 관리 — operational page with clear header nav + filter hierarchy.
 */
export function AdminDeliveryAdPartnerMembershipsView() {
  const { language, safeT } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const partnerCatalog = useAdminPartnerCatalogConfig();
  const [items, setItems] = useState<MembershipRow[]>([]);
  const [filter, setFilter] = useState<
    "open" | "PENDING_REVIEW" | "ACTIVE" | "CANCEL_PENDING" | "ENDED" | "all"
  >("open");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void partnerCatalog.load();
  }, []);

  const load = useCallback(async () => {
    setError(null);
    const res = await adminFetch(
      `/api/admin/delivery-ads/partner/memberships?status=${encodeURIComponent(filter)}`,
      { credentials: "include", cache: "no-store" }
    );
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      memberships?: MembershipRow[];
      error?: string;
    };
    if (!res.ok || !j.ok) {
      setError(j.error ?? "load_failed");
      setItems([]);
      return;
    }
    setItems(j.memberships ?? []);
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (op: "approve" | "end", membershipId: string) => {
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
          reason: op === "approve" ? "admin_partner_approve" : "admin_partner_end",
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setError(j.error ?? "action_failed");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const filters = [
    ["open", "open", "진행 중", "In progress"],
    ["PENDING_REVIEW", "pending", "가입 대기", "Pending"],
    ["ACTIVE", "active", "이용 중", "Active"],
    ["CANCEL_PENDING", "cancel", "해지 예정", "Cancel pending"],
    ["ENDED", "ended", "종료", "Ended"],
    ["all", "all", "전체", "All"],
  ] as const;

  return (
    <AdminDeliveryCmsChrome>
      <div className="space-y-4 pb-10" data-admin-partner-memberships="design-board">
        <div>
          <p className="text-[12px] text-sam-muted">Delivery › Ads › Partner</p>
          <h1 className="text-[20px] font-bold text-sam-fg">
            {safeT("admin_delivery_ads_partner_manage_title", {
              fallbackKo: "Partner 관리",
              fallbackEn: "Partner management",
            })}
          </h1>
          <p className="mt-1 text-[13px] text-sam-muted">
            {safeT("admin_delivery_ads_partner_manage_desc", {
              fallbackKo: "광고 Partner 요금과 가입 매장을 관리합니다.",
              fallbackEn: "Manage Partner fees and enrolled stores.",
            })}
          </p>
        </div>

        <AdminDeliveryAdsSectionNav />

        <p
          className="rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900"
          data-partner-payment="NOT_IMPLEMENTED"
        >
          {safeT("admin_delivery_ads_partner_payment_note", {
            fallbackKo: "Partner 월 회비 자동 결제는 아직 사용할 수 없습니다.",
            fallbackEn: "Partner monthly fee auto-payment is not available yet.",
          })}
        </p>

        <AdminCard
          title={
            lang === "en" ? "Partner operating settings" : "Partner 운영 설정"
          }
        >
          <p className="mb-3 text-[12px] text-sam-muted">
            {safeT("admin_delivery_ads_commercial_partner_note", {
              fallbackKo:
                "광고 패키지 할인용 멤버십입니다. organic ranking과 분리 · 월 회비 자동 결제는 미구현.",
              fallbackEn:
                "Membership for ad package discounts. Separate from organic ranking · monthly auto-pay not implemented.",
            })}
          </p>
          {partnerCatalog.catalog ? (
            <AdminDeliveryAdPartnerConfigForm
              config={partnerCatalog.catalog.partnerConfig}
              busy={partnerCatalog.busy}
              lang={lang}
              onSave={(body) => void partnerCatalog.savePartner(body)}
            />
          ) : (
            <p className="text-[13px] text-sam-muted">
              {safeT("admin_delivery_ads_loading", {
                fallbackKo: "불러오는 중…",
                fallbackEn: "Loading…",
              })}
            </p>
          )}
          {partnerCatalog.error ? (
            <p className="mt-2 text-[12px] text-red-600">{partnerCatalog.error}</p>
          ) : null}
        </AdminCard>

        {error ? (
          <p className="text-[13px] text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        <div
          className="flex flex-wrap gap-2"
          role="tablist"
          aria-label={
            lang === "en" ? "Membership status filters" : "멤버십 상태 필터"
          }
          data-admin-partner-filters="1"
        >
          {filters.map(([value, key, ko, en]) => {
            const selected = filter === value;
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={selected}
                className={`${FILTER_BTN} ${
                  selected
                    ? "border-[#0A823E] bg-[#0A823E] text-white"
                    : "border-sam-border bg-sam-surface text-sam-fg hover:border-[#0A823E]/50 hover:bg-[#0A823E]/5"
                }`}
                onClick={() => setFilter(value)}
                data-partner-filter={key}
                data-selected={selected ? "1" : "0"}
              >
                {safeT(`admin_delivery_ads_partner_filter_${key}` as "admin_delivery_ads_partner_filter_open", {
                  fallbackKo: ko,
                  fallbackEn: en,
                })}
              </button>
            );
          })}
        </div>

        <AdminCard
          title={lang === "en" ? "Partner memberships" : "Partner 가입 매장"}
        >
          {items.length === 0 ? (
            <p className="text-[13px] text-sam-muted" data-admin-partner-empty="1">
              {safeT("admin_delivery_ads_partner_empty", {
                fallbackKo: "현재 Partner 가입 매장이 없습니다.",
                fallbackEn: "No Partner memberships yet.",
              })}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table
                className="w-full min-w-[560px] border-collapse text-[12px]"
                data-admin-partner-memberships-table="design-board"
              >
                <thead>
                  <tr className="bg-[#F5F5F5] text-left text-[#757575]">
                    <th className="border border-[#BDBDBD] p-2 font-semibold">
                      {safeT("admin_delivery_ads_partner_col_store", {
                        fallbackKo: "매장",
                        fallbackEn: "Store",
                      })}
                    </th>
                    <th className="border border-[#BDBDBD] p-2 font-semibold">
                      {safeT("admin_delivery_ads_partner_col_status", {
                        fallbackKo: "상태",
                        fallbackEn: "Status",
                      })}
                    </th>
                    <th className="border border-[#BDBDBD] p-2 font-semibold">
                      {safeT("admin_delivery_ads_partner_col_period", {
                        fallbackKo: "기간",
                        fallbackEn: "Period",
                      })}
                    </th>
                    <th className="border border-[#BDBDBD] p-2 font-semibold">
                      {safeT("admin_delivery_ads_queue_col_action", {
                        fallbackKo: "처리",
                        fallbackEn: "Action",
                      })}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((m) => (
                    <tr
                      key={m.id}
                      className="bg-white"
                      data-partner-membership-row={m.status}
                    >
                      <td className="border border-[#BDBDBD] p-2 font-medium text-sam-fg">
                        {m.storeName ?? m.storeId}
                      </td>
                      <td className="border border-[#BDBDBD] p-2 text-sam-fg">
                        {lang === "en" ? m.statusLabelEn : m.statusLabelKo}
                      </td>
                      <td className="border border-[#BDBDBD] p-2 text-[#757575]">
                        {m.periodEnd
                          ? `${(m.periodStart ?? "").slice(0, 10)} ~ ${m.periodEnd.slice(0, 10)}`
                          : "—"}
                      </td>
                      <td className="border border-[#BDBDBD] p-2">
                        <div className="flex flex-wrap gap-2">
                          {m.status === "PENDING_REVIEW" ? (
                            <button
                              type="button"
                              disabled={busy}
                              className="inline-flex min-h-[36px] items-center rounded-ui-rect border border-[#0A823E] bg-[#0A823E] px-3 text-[12px] font-semibold text-white transition hover:bg-[#087a38] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A823E]/40 active:scale-[0.99] disabled:opacity-50"
                              onClick={() => void act("approve", m.id)}
                            >
                              {safeT("admin_delivery_ads_partner_approve", {
                                fallbackKo: "승인",
                                fallbackEn: "Approve",
                              })}
                            </button>
                          ) : null}
                          {m.status === "PENDING_REVIEW" ||
                          m.status === "ACTIVE" ||
                          m.status === "CANCEL_PENDING" ? (
                            <button
                              type="button"
                              disabled={busy}
                              className="inline-flex min-h-[36px] items-center rounded-ui-rect border border-sam-border bg-white px-3 text-[12px] font-semibold text-sam-fg transition hover:bg-sam-app focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A823E]/40 active:scale-[0.99] disabled:opacity-50"
                              onClick={() => void act("end", m.id)}
                            >
                              {safeT("admin_delivery_ads_partner_end", {
                                fallbackKo: "종료",
                                fallbackEn: "End",
                              })}
                            </button>
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
