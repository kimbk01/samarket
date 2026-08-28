"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

/** Primary CTA on brand green — white label SSOT (beats Link/button inherit). */
export const COMMERCE_PRIMARY_BTN_CLASS =
  "sam-btn-primary inline-flex min-h-[44px] items-center justify-center px-4 text-sm text-white";

export const COMMERCE_SECONDARY_BTN_CLASS =
  "sam-btn-secondary inline-flex min-h-[44px] items-center justify-center px-4 text-sm";

/** Primary commerce CTA — white label on brand green (Link inherits parent color otherwise). */
export function CommercePrimaryCtaLink({
  href,
  children,
  className = "",
  ...rest
}: {
  href: string;
  children: ReactNode;
  className?: string;
} & Record<string, string | undefined>) {
  return (
    <Link
      href={href}
      prefetch={false}
      className={`${COMMERCE_PRIMARY_BTN_CLASS} flex-1 ${className}`}
      {...rest}
    >
      {children}
    </Link>
  );
}

export function CommerceSecondaryCtaLink({
  href,
  children,
  className = "",
  ...rest
}: {
  href: string;
  children: ReactNode;
  className?: string;
} & Record<string, string | undefined>) {
  return (
    <Link
      href={href}
      prefetch={false}
      className={`${COMMERCE_SECONDARY_BTN_CLASS} flex-1 ${className}`}
      {...rest}
    >
      {children}
    </Link>
  );
}

export function CommercePrimaryCtaButton({
  children,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`${COMMERCE_PRIMARY_BTN_CLASS} ${className}`} {...rest}>
      {children}
    </button>
  );
}

/** Compact segmented sub-tab row — reference §7, not 2×2 form buttons. */
export function CommerceHubSegmentTabs<T extends string>({
  tabs,
  activeId,
  hrefFor,
  labelFor,
  countFor,
  dataAttr = "data-wallet-tab",
}: {
  tabs: readonly T[];
  activeId: T;
  hrefFor: (id: T) => string;
  labelFor: (id: T) => string;
  countFor?: (id: T) => number;
  dataAttr?: string;
}) {
  return (
    <div
      className="mb-3 flex min-w-0 rounded-ui-rect border border-sam-border bg-sam-app p-0.5"
      role="tablist"
      data-commerce-hub-segment-tabs="1"
    >
      {tabs.map((id) => {
        const selected = activeId === id;
        const count = countFor?.(id) ?? 0;
        return (
          <Link
            key={id}
            href={hrefFor(id)}
            prefetch={false}
            role="tab"
            aria-selected={selected}
            {...{ [dataAttr]: id }}
            className={`flex min-h-[36px] min-w-0 flex-1 flex-col items-center justify-center rounded-[6px] px-1 py-1 text-center transition-colors ${
              selected
                ? "bg-sam-surface text-sam-fg shadow-sm"
                : "text-sam-muted hover:text-sam-fg"
            }`}
          >
            <span className="w-full truncate text-[11px] font-semibold leading-tight sm:text-xs">
              {labelFor(id)}
            </span>
            <span className="tabular-nums text-[10px] font-medium leading-none text-sam-muted">
              {count}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
