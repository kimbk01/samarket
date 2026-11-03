"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { OwnerStoreOpsSnapshot } from "@/lib/stores/owner-store-ops-snapshot";
import { buildOwnerOrdersEntryHref } from "@/lib/business/owner-orders-entry-policy";
import { buildOwnerMobileStackedLabelCountAriaLabel } from "@/lib/business/owner-mobile-stacked-label-count";
import { OwnerDashSectionHeader } from "./OwnerDashSectionHeader";
import { OWNER_COMPACT_SHELL_MAX_TW } from "@/lib/business/owner-compact-shell-viewport";
import { cn, ownerDashCardClass, ownerDashTypography } from "./owner-dashboard-ui";
import type { MessageKey } from "@/lib/i18n/messages";

type FlowStepKey = "waiting" | "cooking" | "delivering" | "done";

const STEPS: Array<{
  key: FlowStepKey;
  labelKey: MessageKey;
  tab: "new" | "progress" | "shipping" | "done";
}> = [
  { key: "waiting", labelKey: "store_owner_dash_flow_waiting", tab: "new" },
  { key: "cooking", labelKey: "store_owner_dash_flow_cooking", tab: "progress" },
  { key: "delivering", labelKey: "store_owner_dash_flow_delivering", tab: "shipping" },
  { key: "done", labelKey: "store_owner_dash_flow_done", tab: "done" },
];

/**
 * 홈 「주문 진행」 — 4칸 단계 막대(흰 바탕·숫자 중심). 지연은 빨간 글자 1줄만.
 * 이전: 그린·브라운·골드로 채운 원 4개 → 누르는 버튼처럼 보이고 하단 내비 원과 겹쳐 보였음
 * (Owner 2026-11-03 · docs/audit/owner-e2e-round2-review-and-dashboard-design-2026-11-03.md §4-3).
 * 처리할 주문이 남은 단계는 아래 골드 선으로만 표시. 칸을 누르면 해당 탭 주문 목록(기존 링크).
 */
export function OwnerOrderFlowCard({
  storeId,
  snapshot,
}: {
  storeId: string;
  snapshot: OwnerStoreOpsSnapshot;
}) {
  const { t } = useI18n();
  const ordersHref = buildOwnerOrdersEntryHref({ storeId, freshList: true });
  const counts: Record<FlowStepKey, number> = {
    waiting: snapshot.flow_waiting_count,
    cooking: snapshot.flow_cooking_count,
    delivering: snapshot.flow_delivering_count,
    done: snapshot.flow_completed_today_count,
  };
  const delays: Record<FlowStepKey, number> = {
    waiting: 0,
    cooking: snapshot.flow_cooking_delayed_count,
    delivering: snapshot.flow_delivering_delayed_count,
    done: 0,
  };

  return (
    <section
      className={ownerDashCardClass(`${OWNER_COMPACT_SHELL_MAX_TW}:mx-0`)}
      aria-labelledby="owner-flow-title"
    >
      <OwnerDashSectionHeader
        id="owner-flow-title"
        title={t("store_owner_dash_order_flow")}
        href={ordersHref}
        linkLabel={t("store_owner_dash_orders_list_link")}
      />
      <div
        className="grid grid-cols-4 divide-x divide-[var(--biz-card-border)] overflow-hidden rounded-ui-rect border border-[var(--biz-card-border)]"
        data-owner-home-order-flow="1"
      >
        {STEPS.map((step) => {
          const count = counts[step.key];
          const delay = delays[step.key];
          const pending = step.key !== "done" && count > 0;
          return (
            <Link
              key={step.key}
              href={buildOwnerOrdersEntryHref({ storeId, tab: step.tab, freshList: true })}
              prefetch={false}
              aria-label={buildOwnerMobileStackedLabelCountAriaLabel(t(step.labelKey), count)}
              data-owner-home-order-flow-step={step.key}
              className={cn(
                "flex min-h-[72px] min-w-0 flex-col items-center justify-center bg-[var(--biz-card-bg)] px-1 py-2 text-center active:bg-[var(--biz-tan-soft)]",
                pending ? "shadow-[inset_0_-3px_0_var(--dibay-gold)]" : ""
              )}
            >
              <span className={cn(ownerDashTypography.cellTitle, "truncate")}>{t(step.labelKey)}</span>
              <span className={cn(ownerDashTypography.metric, "mt-0.5")}>{count}</span>
              {delay > 0 ? (
                <span className="mt-0.5 text-[11px] font-semibold leading-tight text-sam-danger">
                  {t("store_owner_dash_delay_count", { count: delay })}
                </span>
              ) : (
                <span className="mt-0.5 block h-[14px]" aria-hidden />
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
