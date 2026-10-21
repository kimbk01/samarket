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

  return (
    <AdminCard titleKey="store_coupon_admin_role_list">
      <div className="flex min-w-0 flex-col gap-3" data-admin-coupon-pane="list">
        {visible.length === 0 ? (
          <AdminEmptyState ko={ko} message={onReset ? undefined : t("store_coupon_admin_list_empty")} onReset={onReset} />
        ) : (
          <>
            <ul className="flex min-w-0 flex-col gap-2" data-admin-coupon-list-scroll="1">
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
                const meta: Array<[string, string]> = [
                  [t("store_coupon_ops_issued_at"), formatAdminCouponDay(row.created_at) || "—"],
                  [t("store_coupon_owner_issued_limit"), row.issue_limit == null ? "—" : String(row.issue_limit)],
                  [t("store_coupon_owner_issued_actual"), String(issued)],
                  [t("store_coupon_owner_held_active"), String(held)],
                  [t("store_coupon_owner_used", { count: row.redeemed_count }), String(row.redeemed_count)],
                  [t("store_coupon_ops_remaining"), remaining == null ? "—" : String(remaining)],
                  [t("store_coupon_ops_gmv"), formatMoneyPhp(Number(row.order_sales_php ?? 0))],
                  [t("store_coupon_ops_discount_total"), formatMoneyPhp(row.realized.customer_discount)],
                  [t("store_coupon_ops_store_burden"), formatMoneyPhp(row.realized.store_funded)],
                  [t("store_coupon_ops_platform_burden"), formatMoneyPhp(row.realized.platform_funded)],
                ];
                return (
                  <li key={row.id}>
                    <AdminActionButton
                      variant="secondary" className="!h-auto w-full min-w-0 !flex-col !items-stretch !justify-start !whitespace-normal p-3 text-left font-normal"
                      data-admin-coupon-list-row="1"
                      onClick={() => onOpenDetail(row.id)}
                    >
                      <div className="flex min-w-0 items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-sam-fg">{title}</p>
                          <p className="mt-0.5 text-xs text-sam-muted">
                            {storeLabel} · {issuerLabel} · {t(adminCouponFundingMessageKey(row.funding_mode))}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs font-medium text-sam-fg">
                          {(() => {
                            const lc = String(row.lifecycle_state ?? "").trim().toLowerCase();
                            const shared = adminStatusLabel("coupon", lc, ko);
                            return shared.known && !DATE_AWARE_LIFECYCLE.has(lc)
                              ? shared.label
                              : t(adminCouponLifecycleMessageKey(row.lifecycle_state, row.start_at, row.end_at, row.is_active));
                          })()}
                        </span>
                      </div>
                      <p className="mt-1 text-base font-bold tabular-nums text-signature">{benefitText(row)}</p>
                      <dl className="mt-2 grid min-w-0 grid-cols-2 gap-x-2 gap-y-1" data-admin-coupon-ops-grid="1">
                        {meta.map(([label, value]) => (
                          <div key={label} className="min-w-0">
                            <dt className="truncate text-[12px] text-sam-muted">{label}</dt>
                            <dd className="truncate text-xs tabular-nums text-sam-fg">{value}</dd>
                          </div>
                        ))}
                      </dl>
                    </AdminActionButton>
                  </li>
                );
              })}
            </ul>
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
