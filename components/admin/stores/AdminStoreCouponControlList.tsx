"use client";

import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminCard } from "@/components/admin/AdminCard";
import type { AdminListPageSize } from "@/lib/admin/list-query/admin-list-query";
import type { CouponCampaignOpsView } from "@/lib/stores/load-coupon-campaign-ops-bundle";
import type { CouponControlCampaignView } from "@/lib/stores/admin-coupon-control-realized";
import {
  adminCouponFundingMessageKey,
  adminCouponLifecycleMessageKey,
  formatAdminCouponDay,
  humanAdminStoreName,
  looksLikeRawOperatorToken,
} from "@/lib/stores/admin-coupon-control-view";
import { formatMoneyPhp } from "@/lib/utils/format";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { adminStatusLabel } from "@/lib/admin/status-labels/delivery-status-labels";

/** Date-aware lifecycle states keep the owner status key (upcoming / ended by window); others use the shared coupon labels. */
const DATE_AWARE_LIFECYCLE = new Set(["active", "approved", "scheduled"]);

type AdminListRow = CouponControlCampaignView & Partial<CouponCampaignOpsView>;

function benefitText(row: CouponControlCampaignView): string {
  if (row.discount_type === "percent") return `${row.discount_value}%`;
  return formatMoneyPhp(row.discount_value);
}

/**
 * 쿠폰 목록 — 필터(상태·매장·재원)는 화면 상단 AdminFilterBar(주소 `status`·`store_id`·`funding`)가 정하고,
 * 거르기·정렬·쪽 나누기·전체 건수는 서버(DB `admin_store_coupon_campaign_page`)가 한다 (R7). 여기서는 받은 쪽만 그린다.
 */
export function AdminStoreCouponControlList({
  campaigns,
  onOpenDetail,
  total,
  page,
  size,
  onPageChange,
  onSizeChange,
  pending = false,
  onReset,
}: {
  campaigns: AdminListRow[];
  onOpenDetail: (campaignId: string) => void;
  /** 서버가 돌려준 전체 건수 */
  total: number;
  page: number;
  size: AdminListPageSize;
  onPageChange: (page: number) => void;
  onSizeChange: (size: AdminListPageSize) => void;
  pending?: boolean;
  /** 필터가 걸려 있으면 빈 목록에 [초기화] */
  onReset?: () => void;
}) {
  const { t, safeT, language } = useI18n();
  const ko = language !== "en";
  const visible = campaigns;
  /** 운영 지표 열 머리 — 행 값(metaValues)과 같은 순서. 사용 수 라벨은 개수 없는 형태로 머리에 쓴다. */
  const metaLabels: string[] = [
    t("store_coupon_ops_issued_at"),
    t("store_coupon_owner_issued_limit"),
    t("store_coupon_owner_issued_actual"),
    t("store_coupon_owner_held_active"),
    ko ? "사용" : "Used",
    t("store_coupon_ops_remaining"),
    t("store_coupon_ops_gmv"),
    t("store_coupon_ops_discount_total"),
    t("store_coupon_ops_store_burden"),
    t("store_coupon_ops_platform_burden"),
  ];

  return (
    <AdminCard titleKey="store_coupon_admin_role_list">
      <div className="flex min-w-0 flex-col gap-3" data-admin-coupon-pane="list">
        {visible.length === 0 ? (
          <AdminEmptyState ko={ko} message={onReset ? undefined : t("store_coupon_admin_list_empty")} onReset={onReset} />
        ) : (
          <>
            {/* 표준 표 (§2.8 목록) — 열: 쿠폰(매장·발행 주체·재원)·상태·혜택·운영 지표·상세 */}
            <div className="overflow-x-auto" data-admin-coupon-list-scroll="1">
              <table className="w-full min-w-[80rem] border-collapse text-left sam-text-body-secondary">
                <thead>
                  <tr className="border-b border-sam-border text-left sam-text-xxs text-sam-muted">
                    <th className="py-2 pr-2 font-medium">{t("store_coupon_field_title")}</th>
                    <th className="py-2 pr-2 font-medium">{ko ? "상태" : "Status"}</th>
                    <th className="py-2 pr-2 font-medium">{ko ? "혜택" : "Benefit"}</th>
                    {metaLabels.map((label) => (
                      <th key={label} className="py-2 pr-2 font-medium">
                        {label}
                      </th>
                    ))}
                    <th className="py-2 pr-2 font-medium">{adminCta("detail", ko)}</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => {
                    const storeLabel =
                      humanAdminStoreName(row.store_name) ??
                      safeT("store_coupon_wallet_store_fallback", { fallbackKo: "매장", fallbackEn: "Store" });
                    const titleRaw = String(row.title ?? "").trim();
                    const title =
                      titleRaw && !looksLikeRawOperatorToken(titleRaw)
                        ? titleRaw
                        : t("store_coupon_field_title");
                    const issued = row.issued_count;
                    const remaining =
                      row.remaining_claim_slots != null
                        ? row.remaining_claim_slots
                        : row.issue_limit != null
                          ? Math.max(0, row.issue_limit - row.issued_count)
                          : null;
                    const held = row.active_held_count ?? Math.max(0, row.claimed_count - row.redeemed_count);
                    const issuerLabel = row.issuer ? t(row.issuer.roleKey) : "—";
                    const metaValues: string[] = [
                      formatAdminCouponDay(row.created_at) || "—",
                      row.issue_limit == null ? "—" : String(row.issue_limit),
                      String(issued),
                      String(held),
                      String(row.redeemed_count),
                      remaining == null ? "—" : String(remaining),
                      formatMoneyPhp(Number(row.order_sales_php ?? 0)),
                      formatMoneyPhp(row.realized.customer_discount),
                      formatMoneyPhp(row.realized.store_funded),
                      formatMoneyPhp(row.realized.platform_funded),
                    ];
                    const lc = String(row.lifecycle_state ?? "").trim().toLowerCase();
                    const shared = adminStatusLabel("coupon", lc, ko);
                    const statusText =
                      shared.known && !DATE_AWARE_LIFECYCLE.has(lc)
                        ? shared.label
                        : t(adminCouponLifecycleMessageKey(row.lifecycle_state, row.start_at, row.end_at, row.is_active));
                    return (
                      <tr
                        key={row.id}
                        className="border-b border-sam-border/70 align-top"
                        data-admin-coupon-list-row="1"
                        data-admin-coupon-ops-grid="1"
                      >
                        <td className="max-w-[16rem] py-2 pr-2">
                          <p className="font-semibold text-sam-fg">{title}</p>
                          <p className="mt-0.5 text-[12px] text-sam-muted">
                            {storeLabel} · {issuerLabel} · {t(adminCouponFundingMessageKey(row.funding_mode))}
                          </p>
                        </td>
                        <td className="whitespace-nowrap py-2 pr-2 font-medium text-sam-fg">{statusText}</td>
                        <td className="whitespace-nowrap py-2 pr-2 font-bold tabular-nums text-signature">
                          {benefitText(row)}
                        </td>
                        {metaValues.map((value, i) => (
                          <td key={metaLabels[i]} className="whitespace-nowrap py-2 pr-2 tabular-nums text-sam-fg">
                            {value}
                          </td>
                        ))}
                        <td className="py-2 pr-2">
                          <AdminActionButton variant="ghost" size="sm" onClick={() => onOpenDetail(row.id)}>
                            {adminCta("detail", ko)}
                          </AdminActionButton>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <AdminPagination
              ko={ko}
              page={page}
              size={size}
              total={total}
              onPageChange={onPageChange}
              onSizeChange={onSizeChange}
              disabled={pending}
            />
          </>
        )}
      </div>
    </AdminCard>
  );
}
