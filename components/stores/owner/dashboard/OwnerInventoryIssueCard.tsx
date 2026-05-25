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
      href: productsBase,
    },
    {
      id: "options",
      label: t("store_owner_dash_option_errors"),
      count: snapshot.option_error_health_available ? snapshot.option_error_product_count : null,
      sub: snapshot.option_error_health_available
        ? t("store_owner_dash_fix_needed")
        : t("store_owner_dash_check_scheduled"),
      danger: snapshot.option_error_health_available && snapshot.option_error_product_count > 0,
      href: OwnerRoutes.menu(storeId),
    },
  ];

  return (
    <section className={ownerDashCardClass()} aria-labelledby="owner-inventory-title">
      <OwnerDashSectionHeader id="owner-inventory-title" title={t("store_owner_dash_inventory_issues")} href={productsBase} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {cells.map((c) => (
          <Link
            key={c.id}
            href={c.href}
            prefetch={false}
            className="min-h-[72px] rounded-[4px] border border-[var(--biz-card-border)] bg-[var(--biz-tan-soft)] p-2 active:bg-[var(--biz-primary-soft)]"
          >
            <p className={ownerDashTypography.cellTitle}>{c.label}</p>
            <p
              className={`mt-1 ${ownerDashTypography.metric} ${c.danger ? "text-[#DC2626]" : ""}`}
            >
              {c.count == null ? "—" : t("store_owner_dash_count_items", { count: c.count })}
            </p>
            <p
              className={`mt-0.5 ${ownerDashTypography.helper} ${c.danger ? "font-medium text-[#DC2626]" : ""}`}
            >
              {c.sub}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
