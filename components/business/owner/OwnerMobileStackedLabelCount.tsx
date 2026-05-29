"use client";

import type { ReactNode } from "react";
import {
  OWNER_MOBILE_STACKED_TAB_COUNT_CLASS,
  OWNER_MOBILE_STACKED_TAB_LABEL_CLASS,
} from "@/lib/business/owner-mobile-stacked-label-count";

export type OwnerMobileStackedLabelCountVariant = "tab" | "kpi" | "flow";

type VariantStyles = {
  root: string;
  label: string;
  count: string;
  reserveZeroCountRow: boolean;
};

const VARIANT_STYLES: Record<OwnerMobileStackedLabelCountVariant, VariantStyles> = {
  tab: {
    root: "flex min-w-0 w-full flex-col items-center justify-center gap-0.5",
    label: OWNER_MOBILE_STACKED_TAB_LABEL_CLASS,
    count: OWNER_MOBILE_STACKED_TAB_COUNT_CLASS,
    reserveZeroCountRow: true,
  },
  kpi: {
    root: "flex w-full flex-col items-center text-center",
    label: "text-[10px] font-semibold leading-[1.35] text-[#6B7280]",
    count: "mt-0.5 text-[17px] font-bold leading-none tabular-nums",
    reserveZeroCountRow: false,
  },
  flow: {
    root: "flex min-w-0 w-full flex-col items-center",
    label: "mt-1.5 text-[11px] font-medium leading-tight text-[#8C8C8C]",
    count: "mt-0.5 text-[16px] font-bold leading-tight tabular-nums text-[#262626]",
    reserveZeroCountRow: false,
  },
};

export function OwnerMobileStackedLabelCount({
  label,
  count,
  variant = "tab",
  active = false,
  countClassName = "",
  labelClassName = "",
  footer,
}: {
  label: string;
  count: number;
  variant?: OwnerMobileStackedLabelCountVariant;
  active?: boolean;
  countClassName?: string;
  labelClassName?: string;
  footer?: ReactNode;
}) {
  const styles = VARIANT_STYLES[variant];
  const showCount = count > 0;
  const reserveZeroCountRow = styles.reserveZeroCountRow && !showCount;

  const labelTone =
    variant === "tab"
      ? active
        ? "text-white"
        : "text-[var(--biz-text)]"
      : "";

  const countTone =
    variant === "tab"
      ? active
        ? "text-white"
        : "text-[var(--biz-text)]"
      : "";

  return (
    <div className={styles.root}>
      <span className={[styles.label, labelTone, labelClassName].filter(Boolean).join(" ")}>
        {label}
      </span>
      <span
        className={[
          styles.count,
          countTone,
          countClassName,
          reserveZeroCountRow ? "invisible" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-hidden={reserveZeroCountRow}
      >
        {showCount ? count : 0}
      </span>
      {footer}
    </div>
  );
}
