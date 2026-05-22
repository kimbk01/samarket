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
      label: "품절",
      count: snapshot.sold_out_product_count,
      sub: snapshot.sold_out_product_count > 0 ? "재고 확인 필요" : "정상",
      danger: snapshot.sold_out_product_count > 0,
      href: `${productsBase}${productsBase.includes("?") ? "&" : "?"}status=sold_out`,
    },
    {
      label: "숨김",
      count: snapshot.hidden_product_count,
      sub: snapshot.hidden_product_count > 0 ? "판매 상태 점검" : "정상",
      danger: snapshot.hidden_product_count > 0,
      href: `${productsBase}${productsBase.includes("?") ? "&" : "?"}status=hidden`,
    },
    {
      label: "판매중지",
      count: snapshot.sale_suspended_product_count,
      sub: snapshot.sale_suspended_product_count > 0 ? "초안·미게시" : "정상",
      danger: snapshot.sale_suspended_product_count > 0,
      href: productsBase,
    },
    {
      label: "옵션 오류",
      count: snapshot.option_error_health_available ? snapshot.option_error_product_count : null,
      sub: snapshot.option_error_health_available ? "수정 필요" : "점검 예정",
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
            key={c.label}
            href={c.href}
            prefetch={false}
            className="min-h-[72px] rounded-[4px] border border-[#E5E7EB] bg-[#FAFAFA] p-2 active:bg-gray-100"
          >
            <p className={ownerDashTypography.cellTitle}>{c.label}</p>
            <p
              className={`mt-1 ${ownerDashTypography.metric} ${c.danger ? "text-[#DC2626]" : ""}`}
            >
              {c.count == null ? "—" : `${c.count}개`}
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
