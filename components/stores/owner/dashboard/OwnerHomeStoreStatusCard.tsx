"use client";

import Link from "next/link";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import { BusinessStatusBadge } from "@/components/business/admin/BusinessStatusBadge";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { parsePostgresBool } from "@/lib/community-feed/parse-postgres-bool";
import { ownerDashCardClass } from "./owner-dashboard-ui";
import { useOwnerMinuteNow } from "@/components/business/owner/OwnerStoreCommerceStateLabel";
import { resolveOwnerStoreCommerceStateLabel } from "@/lib/stores/store-commerce-state-label";

/**
 * Home STORE STATUS — 상태 칩 + 「매장 관리에서 변경」 링크만.
 * IA-12 · Owner 권장안(2026-11-03): 노출·영업을 바꾸는 곳은 `/settings`(매장 관리) 1곳.
 * 이 카드는 승인 매장 대시보드에서만 그려진다(`MyBusinessPage`) — 승인 대기 분기 없음.
 */
export function OwnerHomeStoreStatusCard({ row }: { row: StoreRow }) {
  const { t } = useI18n();
  const now = useOwnerMinuteNow();
  const visible = parsePostgresBool(row.is_visible, false);
  // OPS-04 — 원값 is_open 이 아니라 주문자·관리자와 같은 실효 판정(스케줄·휴게·휴무·수동 마감).
  const commerce = resolveOwnerStoreCommerceStateLabel(row, now);
  const open = commerce.isOpenForCommerce;

  return (
    <section
      className={`${ownerDashCardClass()} flex flex-wrap items-center gap-2`}
      data-owner-home-store-status="1"
      aria-label={t("owner_copy_home_store_status_aria")}
    >
      <BusinessStatusBadge tone={visible ? "success" : "muted"}>
        {t("owner_stage4_status_visible_label")} · {visible ? t("business_phase7_029") : t("business_phase7_132")}
      </BusinessStatusBadge>
      <BusinessStatusBadge tone={open ? "success" : "muted"}>
        {t("owner_stage4_status_open_label")} · {t(commerce.labelKey)}
      </BusinessStatusBadge>
      <Link
        href={OwnerRoutes.settings(row.id)}
        className="ml-auto text-xs font-semibold text-sam-primary underline"
        data-owner-home-store-status-settings-link="1"
      >
        {t("owner_stage4_change_in_store_manage")}
      </Link>
    </section>
  );
}
