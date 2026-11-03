"use client";

import Link from "next/link";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { parsePostgresBool } from "@/lib/community-feed/parse-postgres-bool";
import { ownerDashCardClass } from "./owner-dashboard-ui";
import { useOwnerMinuteNow } from "@/components/business/owner/OwnerStoreCommerceStateLabel";
import { resolveOwnerStoreCommerceStateLabel } from "@/lib/stores/store-commerce-state-label";

/**
 * Home STORE STATUS — 한 줄: 「노출 공개중 | 영업중 · 매장 관리에서 변경」.
 * 이전 「노출 · 공개중」「영업 · 영업중」 칩 2개는 헤더 칩과 겹치고 「영업 · 영업중」처럼 같은 말이 반복됐음 (Owner 2026-11-03 §4-1).
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
      className={ownerDashCardClass("flex items-center gap-2 py-2.5 text-[13px] text-[var(--biz-text)]")}
      data-owner-home-store-status="1"
      aria-label={t("owner_copy_home_store_status_aria")}
    >
      <span className="min-w-0 truncate">
        {t("owner_stage4_status_visible_label")}{" "}
        <b className={visible ? "text-sam-success" : "text-sam-muted"} data-owner-home-store-status-visible={visible ? "1" : "0"}>
          {visible ? t("business_phase7_029") : t("business_phase7_132")}
        </b>
      </span>
      <span className="text-[var(--biz-card-border)]" aria-hidden>
        |
      </span>
      <b className={`min-w-0 truncate ${open ? "text-sam-success" : "text-sam-muted"}`}>{t(commerce.labelKey)}</b>
      <Link
        href={OwnerRoutes.settings(row.id)}
        className="ml-auto inline-flex min-h-11 shrink-0 items-center text-xs font-semibold text-sam-primary underline"
        data-owner-home-store-status-settings-link="1"
      >
        {t("owner_stage4_change_in_store_manage")}
      </Link>
    </section>
  );
}
