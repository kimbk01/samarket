"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { OwnerStoreOpsSnapshot } from "@/lib/stores/owner-store-ops-snapshot";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
import {
  OwnerFlowStepArrow,
  OwnerFlowStepCircle,
  OWNER_FLOW_CIRCLE_PX,
  type OwnerFlowStepVariant,
} from "@/components/stores/owner/dashboard/owner-order-flow-icons";
import { OwnerDashSectionHeader } from "./OwnerDashSectionHeader";
import { OWNER_COMPACT_SHELL_MAX_TW } from "@/lib/business/owner-compact-shell-viewport";
import { ownerDashCardClass } from "./owner-dashboard-ui";

const STEPS: Array<{
  key: OwnerFlowStepVariant;
  label: string;
  tab: "new" | "progress" | "shipping" | "done";
}> = [
  { key: "waiting", label: "주문접수", tab: "new" },
  { key: "cooking", label: "준비(조리)중", tab: "progress" },
  { key: "delivering", label: "배달중", tab: "shipping" },
  { key: "done", label: "배달완료", tab: "done" },
];

export function OwnerOrderFlowCard({
  storeId,
  snapshot,
}: {
  storeId: string;
  snapshot: OwnerStoreOpsSnapshot;
}) {
  const { t } = useI18n();
  const ordersHref = buildStoreOrdersHref({ storeId });
  const counts = {
    waiting: snapshot.flow_waiting_count,
    cooking: snapshot.flow_cooking_count,
    delivering: snapshot.flow_delivering_count,
    done: snapshot.flow_completed_today_count,
  };
  const delays = {
    cooking: snapshot.flow_cooking_delayed_count,
    delivering: snapshot.flow_delivering_delayed_count,
  };

  return (
    <section
      className={ownerDashCardClass(`${OWNER_COMPACT_SHELL_MAX_TW}:mx-0`)}
      aria-labelledby="owner-flow-title"
    >
      <OwnerDashSectionHeader id="owner-flow-title" title={t("store_owner_dash_order_flow")} href={ordersHref} />
      <div className="flex w-full min-w-0 items-start justify-between">
        {STEPS.map((step, idx) => {
          const count = counts[step.key];
          const delay =
            step.key === "cooking"
              ? delays.cooking
              : step.key === "delivering"
                ? delays.delivering
                : 0;
          const href = buildStoreOrdersHref({ storeId, tab: step.tab });
          return (
            <div key={step.key} className="flex min-w-0 flex-1 items-start">
              <Link
                href={href}
                prefetch={false}
                className="flex min-w-0 flex-1 flex-col items-center active:opacity-85"
              >
                <div
                  className="flex items-center justify-center"
                  style={{ height: OWNER_FLOW_CIRCLE_PX }}
                >
                  <OwnerFlowStepCircle variant={step.key} />
                </div>
                <span className="mt-1.5 text-[11px] font-medium leading-tight text-[#8C8C8C]">
                  {step.label}
                </span>
                <span className="mt-0.5 text-[16px] font-bold leading-tight tabular-nums text-[#262626]">
                  {count}
                </span>
                {delay > 0 ? (
                  <span className="mt-0.5 text-[10px] font-semibold leading-tight text-[#FF4D4F]">
                    지연 {delay}건
                  </span>
                ) : (
                  <span className="mt-0.5 block h-[14px]" aria-hidden />
                )}
              </Link>
              {idx < STEPS.length - 1 ? (
                <div
                  className="flex shrink-0 items-center px-0.5"
                  style={{ height: OWNER_FLOW_CIRCLE_PX }}
                >
                  <OwnerFlowStepArrow className="text-[14px]" />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

