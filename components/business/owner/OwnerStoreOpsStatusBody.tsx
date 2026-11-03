"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { BusinessOwnerOpsStrip } from "@/components/business/BusinessOwnerOpsStrip";
import { BusinessStatusBadge } from "@/components/business/admin/BusinessStatusBadge";
import { useOwnerMinuteNow } from "@/components/business/owner/OwnerStoreCommerceStateLabel";
import { resolveOwnerStoreCommerceStateLabel } from "@/lib/stores/store-commerce-state-label";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import type { BusinessProfile } from "@/lib/types/business";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import { parsePostgresBool } from "@/lib/community-feed/parse-postgres-bool";

type Props = {
  row: StoreRow;
  profile: BusinessProfile;
  canSell: boolean;
};

/**
 * Ops-status — read approval/visibility/sales rights + resolution CTAs to real edit homes.
 * No invented "request approval" mutation.
 */
export function OwnerStoreOpsStatusBody({ row, profile, canSell }: Props) {
  const { t } = useI18n();
  const sid = row.id;
  const approved = String(row.approval_status ?? "").toLowerCase() === "approved";
  const visible = row.is_visible === true;
  /** 관리자 숨김(잠금) — 사장님이 켤 수 없으므로 「노출을 켜세요」 대신 매장 관리 화면과 같은 잠금 안내 (실기 2026-11-03 B4) */
  const adminLocked =
    !visible &&
    parsePostgresBool((row as unknown as Record<string, unknown>).admin_visibility_locked, false);
  // OPS-04 와 같은 실효 영업 상태(스케줄·휴게·휴무·수동 마감).
  const now = useOwnerMinuteNow();
  const commerce = resolveOwnerStoreCommerceStateLabel(row, now);
  const open = commerce.isOpenForCommerce;

  /**
   * IA-12 — 노출·영업 변경 SSOT 는 `/settings`(매장 관리). 이 화면은 상태 + 「매장 관리에서 변경」 링크만.
   * R1·R4 (2026-11-03): 안내 문단·개발자 문구·메뉴와 겹치는 바로가기 삭제 · 심사 줄은 승인 전에만.
   */
  return (
    <div className={`max-w-full min-w-0 ${OWNER_STORE_STACK_Y_CLASS}`} data-owner-ops-status="1">
      <BusinessOwnerOpsStrip row={row} profile={profile} canSell={canSell} />

      <section
        className="flex flex-wrap items-center gap-2 rounded-ui-rect border border-sam-border bg-sam-surface p-3"
        data-owner-ops-status-chips="1"
      >
        <BusinessStatusBadge tone={open ? "success" : "muted"}>
          {t("owner_stage4_status_open_label")} · {t(commerce.labelKey)}
        </BusinessStatusBadge>
        <Link
          href={OwnerRoutes.settings(sid)}
          className="ml-auto text-xs font-semibold text-sam-primary underline"
          data-owner-ops-status-settings-link="1"
        >
          {t("owner_stage4_change_in_store_manage")}
        </Link>
      </section>

      {!approved ? (
        <p className="text-xs font-medium text-sam-danger" data-owner-ops-block="approval">
          {t("owner_copy_ops_block_approval")}
        </p>
      ) : null}
      {approved && !visible ? (
        <p className="text-xs font-medium text-sam-muted" data-owner-ops-block="visibility">
          {adminLocked
            ? t("business_ops4_err_admin_visibility_locked")
            : t("owner_copy_ops_block_visibility")}
        </p>
      ) : null}
      {!canSell && approved ? (
        <p className="text-xs font-medium text-sam-muted" data-owner-ops-block="cansell">
          {t("owner_copy_ops_block_cansell")}
        </p>
      ) : null}
    </div>
  );
}
