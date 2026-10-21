"use client";

import type { StoreRow } from "@/lib/stores/db-store-mapper";
import { BusinessAdminOpenToggle } from "@/components/business/admin/BusinessAdminOpenToggle";
import { BusinessAdminVisibleToggle } from "@/components/business/admin/BusinessAdminVisibleToggle";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { ownerUiCopy } from "@/lib/business/owner-ui-copy";
import { parsePostgresBool } from "@/lib/community-feed/parse-postgres-bool";
import { ownerDashCardClass } from "./owner-dashboard-ui";
import { useOwnerMinuteNow } from "@/components/business/owner/OwnerStoreCommerceStateLabel";
import { resolveOwnerStoreCommerceStateLabel } from "@/lib/stores/store-commerce-state-label";

/**
 * Home STORE STATUS — same canonical PATCH writers as Manage/drawer toggles.
 * is_visible = customer discovery exposure; is_open = accepting orders now.
 */
export function OwnerHomeStoreStatusCard({
  row,
  onUpdated,
}: {
  row: StoreRow;
  onUpdated: () => void | Promise<void>;
}) {
  const { language, t } = useI18n();
  const now = useOwnerMinuteNow();
  const visible = parsePostgresBool(row.is_visible, false);
  // OPS-04 — 원값 is_open 이 아니라 주문자·관리자와 같은 실효 판정(스케줄·휴게·휴무·수동 마감).
  const commerce = resolveOwnerStoreCommerceStateLabel(row, now);
  const open = commerce.isOpenForCommerce;
  const stateLabel = t(commerce.labelKey);
  const approved = String(row.approval_status) === "approved";

  const statusLine = !approved
    ? ownerUiCopy(
        language,
        "승인 대기 — 노출·영업 토글은 승인 후 사용할 수 있습니다",
        "Pending approval — visibility and open controls unlock after approval"
      )
    : visible && open
      ? ownerUiCopy(language, "노출 중 · 영업 중 — 주문 접수 가능", "Visible · Open — accepting orders")
      : visible && !open
        ? ownerUiCopy(
            language,
            `노출 중 · ${stateLabel} — 고객에게 보이지만 주문은 불가`,
            `Visible · ${stateLabel} — listed but not accepting orders`
          )
        : !visible && open
          ? ownerUiCopy(
              language,
              "숨김 · 영업 중 — 목록에 안 보이지만 직링크로는 주문 가능",
              "Hidden · Open — not listed; direct link can still order"
            )
          : ownerUiCopy(language, `숨김 · ${stateLabel}`, `Hidden · ${stateLabel}`);

  return (
    <section
      className={`${ownerDashCardClass()} space-y-3`}
      data-owner-home-store-status="1"
      aria-label={ownerUiCopy(language, "매장 영업 상태", "Store operating status")}
    >
      <div>
        <h2 className="text-sm font-bold text-sam-fg">
          {ownerUiCopy(language, "매장 상태", "Store status")}
        </h2>
        <p className="mt-1 text-xs text-sam-muted" data-owner-home-store-status-line="1">
          {statusLine}
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-ui-rect border border-sam-border bg-sam-app/60 px-3 py-2">
          <p className="mb-1.5 text-[11px] font-medium text-sam-muted">
            {ownerUiCopy(language, "노출 — 고객 목록·검색에 표시", "Visibility — shown in customer discovery")}
          </p>
          <BusinessAdminVisibleToggle row={row} onUpdated={onUpdated} />
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-app/60 px-3 py-2">
          <p className="mb-1.5 text-[11px] font-medium text-sam-muted">
            {ownerUiCopy(
              language,
              "주문 받기(수동) — 꺼 두면 영업시간과 무관하게 마감",
              "Accept orders (manual) — off closes the store regardless of hours"
            )}
          </p>
          <BusinessAdminOpenToggle row={row} onUpdated={onUpdated} />
        </div>
      </div>
    </section>
  );
}
