"use client";

import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import { Check, ChefHat, ClipboardList, Package, Truck } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";

export type OwnerFlowStepVariant = "waiting" | "cooking" | "delivering" | "done";

const STEP_STYLE: Record<OwnerFlowStepVariant, { bg: string; Icon: LucideIcon; ariaKey: MessageKey }> = {
  waiting: { bg: "#0B421A", Icon: ClipboardList, ariaKey: "store_owner_flow_aria_waiting" },
  cooking: { bg: "#FA8C16", Icon: ChefHat, ariaKey: "store_owner_flow_aria_cooking" },
  delivering: { bg: "#1890FF", Icon: Truck, ariaKey: "store_owner_flow_aria_delivering" },
  done: { bg: "#BFBFBF", Icon: Check, ariaKey: "store_owner_flow_aria_done" },
};

/** 대시보드 「주문 진행 현황」 원형 직경 (기준 52px 대비 −20%) */
export const OWNER_FLOW_CIRCLE_PX = 42;

export function OwnerFlowStepCircle({
  variant,
  size = OWNER_FLOW_CIRCLE_PX,
}: {
  variant: OwnerFlowStepVariant;
  size?: number;
}) {
  const { t } = useI18n();
  const { bg, Icon, ariaKey } = STEP_STYLE[variant];
  const iconPx = Math.round(size * 0.46);
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full text-white shadow-sm"
      style={{ width: size, height: size, backgroundColor: bg }}
      role="img"
      aria-label={t(ariaKey)}
    >
      <Icon size={iconPx} strokeWidth={2} aria-hidden />
    </span>
  );
}

export function OwnerFlowStepArrow({ className }: { className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 select-none items-center justify-center text-[14px] text-[#D9D9D9] ${className ?? ""}`}
      aria-hidden
    >
      →
    </span>
  );
}

/** 주문 카드·상세 — 단색(흰) 아이콘 */
export function OwnerFlowStepIconMini({
  Icon,
  bg,
  active,
  done,
}: {
  Icon: LucideIcon;
  bg: string;
  active: boolean;
  done: boolean;
}) {
  const circleBg = active || done ? bg : "#E8E8E8";
  const iconColor = active || done ? "#FFFFFF" : "#BFBFBF";
  return (
    <span
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
        active ? "owner-order-card-step-active" : ""
      }`}
      style={
        active
          ? ({
              backgroundColor: circleBg,
              ["--owner-step-pulse" as string]: bg,
            } as CSSProperties)
          : { backgroundColor: circleBg }
      }
      aria-hidden
    >
      <Icon size={14} color={iconColor} strokeWidth={2} />
    </span>
  );
}

export function ownerFlowIconForStepIndex(
  index: number,
  deliveryLike: boolean
): { Icon: LucideIcon; bg: string } {
  if (deliveryLike) {
    const list = [
      { Icon: ClipboardList, bg: "#0B421A" },
      { Icon: ChefHat, bg: "#FA8C16" },
      { Icon: Truck, bg: "#1890FF" },
      { Icon: Check, bg: "#BFBFBF" },
    ];
    return list[index] ?? list[0]!;
  }
  const list = [
    { Icon: ClipboardList, bg: "#0B421A" },
    { Icon: ChefHat, bg: "#FA8C16" },
    { Icon: Package, bg: "#1890FF" },
    { Icon: Check, bg: "#BFBFBF" },
  ];
  return list[index] ?? list[0]!;
}
