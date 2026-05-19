"use client";

import Link from "next/link";
import { Bike, CheckCircle2, ChefHat, ClipboardList } from "lucide-react";
import type { OwnerStoreOpsSnapshot } from "@/lib/stores/owner-store-ops-snapshot";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
import { OwnerDashSectionHeader } from "./OwnerDashSectionHeader";
import { ownerDashCardClass, ownerDashTypography } from "./owner-dashboard-ui";

const STEPS = [
  { key: "waiting", label: "접수대기", tab: "new" as const, icon: ClipboardList },
  { key: "cooking", label: "조리중", tab: "progress" as const, icon: ChefHat },
  { key: "delivering", label: "배달중", tab: "shipping" as const, icon: Bike },
  { key: "done", label: "완료", tab: "done" as const, icon: CheckCircle2 },
];

export function OwnerOrderFlowCard({
  storeId,
  snapshot,
}: {
  storeId: string;
  snapshot: OwnerStoreOpsSnapshot;
}) {
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
    <section className={ownerDashCardClass()} aria-labelledby="owner-flow-title">
      <OwnerDashSectionHeader id="owner-flow-title" title="주문 진행 현황" href={ordersHref} />
      <div className="-mx-0.5 overflow-x-auto pb-0.5">
        <div className="flex min-w-full items-stretch justify-between gap-0">
          {STEPS.map((step, idx) => {
            const count = counts[step.key as keyof typeof counts];
            const delay =
              step.key === "cooking"
                ? delays.cooking
                : step.key === "delivering"
                  ? delays.delivering
                  : 0;
            const Icon = step.icon;
            const href = buildStoreOrdersHref({ storeId, tab: step.tab });
            return (
              <div key={step.key} className="flex flex-1 items-center">
                <Link
                  href={href}
                  prefetch={false}
                  className="flex min-h-[80px] w-full flex-col items-center justify-center px-1 py-2 text-center"
                >
                  <Icon className="h-5 w-5 text-gray-500" strokeWidth={1.75} aria-hidden />
                  <span className={`mt-1.5 ${ownerDashTypography.helper}`}>{step.label}</span>
                  <span className={`mt-0.5 ${ownerDashTypography.metric}`}>{count}</span>
                  {delay > 0 ? (
                    <span className={`mt-0.5 text-[10px] font-semibold text-[#DC2626]`}>
                      지연 {delay}건
                    </span>
                  ) : (
                    <span className="mt-0.5 h-[14px]" aria-hidden />
                  )}
                </Link>
                {idx < STEPS.length - 1 ? (
                  <span className="shrink-0 px-0.5 text-[12px] text-gray-300" aria-hidden>
                    →
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
