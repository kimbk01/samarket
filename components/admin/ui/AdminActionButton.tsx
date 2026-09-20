/**
 * ARO-OPS-UX-002-B8 — presentation-only Admin CTA primitive.
 * Semantic hierarchy only; no new mutation owner.
 *
 * CUT 3: lock PRIMARY contrast under `[data-admin]` — never bare sam-primary washout
 * (global descendant rules can wash out foreground).
 */

import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

export type AdminActionVariant =
  | "primary"
  | "secondary"
  | "neutral"
  | "danger"
  | "ghost"
  | "quiet";

const VARIANT_CLASS: Record<AdminActionVariant, string> = {
  primary:
    "bg-[var(--admin-action-primary-bg,#111827)] text-[var(--admin-action-primary-fg,#ffffff)] hover:bg-[var(--admin-action-primary-hover,#0b1220)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-action-primary-bg,#111827)] disabled:bg-[var(--admin-action-primary-disabled-bg,#9ca3af)] disabled:text-[var(--admin-action-primary-disabled-fg,#f9fafb)] disabled:opacity-100",
  secondary:
    "border border-[var(--admin-console-border,#d0d7e2)] bg-[var(--admin-console-surface,#fff)] text-[var(--admin-console-fg,#1f2937)] hover:bg-[var(--admin-console-hover,#eef1f6)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-console-accent,#1d4ed8)] disabled:opacity-50",
  neutral:
    "border border-[var(--admin-console-border,#d0d7e2)] bg-transparent text-[var(--admin-console-fg,#1f2937)] hover:bg-[var(--admin-console-hover,#eef1f6)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-console-accent,#1d4ed8)] disabled:opacity-50",
  danger:
    "border border-red-800 bg-red-700 text-white hover:bg-red-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-800 disabled:border-red-300 disabled:bg-red-300 disabled:text-white disabled:opacity-100",
  ghost:
    "bg-transparent text-[var(--admin-console-accent,#1d4ed8)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-console-accent,#1d4ed8)] disabled:opacity-50",
  quiet:
    "bg-transparent text-[var(--admin-console-muted,#667085)] hover:text-[var(--admin-console-fg,#1f2937)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-console-border,#d0d7e2)] disabled:opacity-50",
};

function actionClassName(variant: AdminActionVariant, className = "") {
  return [
    "inline-flex min-h-9 items-center justify-center whitespace-nowrap rounded-ui-rect px-3 py-1.5 text-[13px] font-semibold leading-5 transition-colors",
    VARIANT_CLASS[variant],
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

export function AdminActionButton({
  variant = "secondary",
  className = "",
  children,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: AdminActionVariant;
  children: ReactNode;
}) {
  return (
    <button
      type={type}
      data-admin-action={variant === "quiet" ? "quiet" : variant}
      className={actionClassName(variant, className)}
      {...rest}
    >
      {children}
    </button>
  );
}

export function AdminActionLink({
  href,
  variant = "secondary",
  className = "",
  children,
  prefetch = false,
  ...rest
}: {
  href: string;
  variant?: AdminActionVariant;
  className?: string;
  children: ReactNode;
  prefetch?: boolean;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "className" | "children">) {
  return (
    <Link
      href={href}
      prefetch={prefetch}
      data-admin-action={variant === "quiet" ? "quiet" : variant}
      className={actionClassName(variant, className)}
      {...rest}
    >
      {children}
    </Link>
  );
}
