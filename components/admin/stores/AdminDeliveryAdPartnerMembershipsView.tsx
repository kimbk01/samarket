"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdminDeliveryCmsChrome } from "@/components/admin/shell/AdminDeliveryCmsChrome";
import { AdminCard } from "@/components/admin/AdminCard";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { adminFetch } from "@/lib/admin/admin-fetch-client";
import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";

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

export function AdminDeliveryAdPartnerMembershipsView() {
  const { language, safeT } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const [items, setItems] = useState<MembershipRow[]>([]);
  const [filter, setFilter] = useState<"open" | "PENDING_REVIEW" | "ACTIVE" | "CANCEL_PENDING" | "ENDED" | "all">(
    "open"
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  return (
    <AdminDeliveryCmsChrome>
      <div className="space-y-4 pb-10" data-admin-partner-memberships="design-board">
        <div>
          <p className="text-[12px] text-sam-muted">Delivery › Ads › Partner</p>
          <h1 className="text-[20px] font-bold text-sam-fg">
            {safeT("admin_delivery_ads_partner_memberships_title", {
              fallbackKo: "Partner 멤버십",
              fallbackEn: "Partner memberships",
            })}
          </h1>
          <p className="mt-1 text-[13px] text-sam-muted">
            {safeT("admin_delivery_ads_partner_memberships_desc", {
              fallbackKo: "가입 대기 · 이용 중 · 해지 예정 · 종료 (월 회비 결제는 미구현)",
              fallbackEn: "Pending · active · cancel pending · ended (monthly fee payment not implemented)",
            })}
          </p>
          <div className="mt-2 flex flex-wrap gap-3 text-[13px]">
            <Link href={DELIVERY_AD_ADMIN_ROUTES.hub} className="text-signature underline">
              {safeT("admin_delivery_ads_back", { fallbackKo: "광고 운영", fallbackEn: "Ad ops" })}
            </Link>
            <Link
              href={DELIVERY_AD_ADMIN_ROUTES.commercialSettings}
              className="text-signature underline"
            >
              {safeT("admin_delivery_ads_commercial_link", {
                fallbackKo: "광고 상품 설정",
                fallbackEn: "Ad product settings",
              })}
            </Link>
          </div>
        </div>

        <p
          className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 text-[12px] text-sam-muted"
          data-partner-payment="NOT_IMPLEMENTED"
        >
          {safeT("admin_delivery_ads_partner_payment_note", {
            fallbackKo: "Partner 월 회비 Business Cash 결제는 아직 구현되지 않았습니다. 가입·상태만 관리합니다.",
            fallbackEn:
              "Partner monthly fee Business Cash payment is not implemented. Membership apply/state only.",
          })}
        </p>

        {error ? (
          <p className="text-[13px] text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {(
            [
              ["open", "open"],
              ["PENDING_REVIEW", "pending"],
              ["ACTIVE", "active"],
              ["CANCEL_PENDING", "cancel"],
              ["ENDED", "ended"],
              ["all", "all"],
            ] as const
          ).map(([value, key]) => (
            <button
              key={value}
              type="button"
              className={`rounded-ui-rect border px-3 py-1.5 text-[12px] ${
                filter === value
                  ? "border-sam-brand bg-sam-brand/10 text-sam-fg"
                  : "border-sam-border bg-sam-surface text-sam-muted"
              }`}
              onClick={() => setFilter(value)}
            >
              {safeT(`admin_delivery_ads_partner_filter_${key}` as "admin_delivery_ads_partner_filter_open", {
                fallbackKo: value,
                fallbackEn: value,
              })}
            </button>
          ))}
        </div>

        <AdminCard titleKey="admin_delivery_ads_partner_memberships_title">
          {items.length === 0 ? (
            <p className="text-[13px] text-sam-muted">
              {safeT("admin_delivery_ads_partner_empty", {
                fallbackKo: "멤버십이 없습니다.",
                fallbackEn: "No memberships.",
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
                          className="rounded-ui-rect border border-[#0A823E] bg-[#0A823E] px-3 py-1 text-[12px] font-semibold text-white"
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
                          className="rounded-ui-rect border border-[#BDBDBD] bg-white px-3 py-1 text-[12px]"
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
