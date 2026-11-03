"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { OwnerStoreOpsSnapshot } from "@/lib/stores/owner-store-ops-snapshot";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { OwnerDashSectionHeader } from "./OwnerDashSectionHeader";
import { ownerDashCardClass, ownerDashTypography } from "./owner-dashboard-ui";

export function OwnerInventoryIssueCard({
  storeId,
  snapshot,
}: {
  storeId: string;
  snapshot: OwnerStoreOpsSnapshot;
}) {
  const { t } = useI18n();
  const productsBase = OwnerRoutes.products(storeId);
  const cells = [
    {
      id: "sold_out",
      label: t("store_owner_dash_sold_out"),
      count: snapshot.sold_out_product_count,
      sub:
        snapshot.sold_out_product_count > 0
          ? t("store_owner_dash_check_stock")
          : t("store_owner_dash_status_normal"),
      danger: snapshot.sold_out_product_count > 0,
      href: `${productsBase}${productsBase.includes("?") ? "&" : "?"}status=sold_out`,
    },
    {
      id: "hidden",
      label: t("store_owner_dash_hidden"),
      count: snapshot.hidden_product_count,
      sub:
        snapshot.hidden_product_count > 0
          ? t("store_owner_dash_check_sales_status")
          : t("store_owner_dash_status_normal"),
      danger: snapshot.hidden_product_count > 0,
      href: `${productsBase}${productsBase.includes("?") ? "&" : "?"}status=hidden`,
    },
    {
      id: "suspended",
      label: t("store_owner_dash_sale_suspended"),
      count: snapshot.sale_suspended_product_count,
      sub:
        snapshot.sale_suspended_product_count > 0
          ? t("store_owner_dash_draft_unpublished")
          : t("store_owner_dash_status_normal"),
      danger: snapshot.sale_suspended_product_count > 0,
      /** 초안 수 → 상품 목록 「숨김」 탭(숨김+초안) (실기 2026-11-03 P-3: 필터 없는 목록으로 가던 것) */
      href: `${productsBase}${productsBase.includes("?") ? "&" : "?"}status=hidden`,
    },
  ];

  return (
    <section className={ownerDashCardClass()} aria-labelledby="owner-inventory-title">
      <OwnerDashSectionHeader id="owner-inventory-title" title={t("store_owner_dash_inventory_issues")} href={productsBase} />
      <div className="grid grid-cols-3 gap-2">
        {cells.map((c) => (
          <Link
            key={c.id}
            href={c.href}
            prefetch={false}
            className="min-h-[72px] rounded-ui-rect border border-[var(--biz-card-border)] bg-[var(--biz-tan-soft)] p-2 active:bg-[var(--biz-primary-soft)]"
          >
            <p className={ownerDashTypography.cellTitle}>{c.label}</p>
            <p
              className={`mt-1 ${ownerDashTypography.metric} ${c.danger ? "text-sam-danger" : ""}`}
            >
              {c.count == null ? "—" : t("store_owner_dash_count_items", { count: c.count })}
            </p>
            <p
              className={`mt-0.5 ${ownerDashTypography.helper} ${c.danger ? "font-medium text-sam-danger" : ""}`}
            >
              {c.sub}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
