/**
 * ARO-OPS-UX-002-B8 — presentation-only Admin CTA primitive.
 * Semantic hierarchy only; no new mutation owner.
 */

import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type AdminActionVariant = "primary" | "secondary" | "neutral" | "danger" | "ghost";

const VARIANT_CLASS: Record<AdminActionVariant, string> = {
  primary:
    "bg-[var(--admin-console-fg,#111)] text-[var(--admin-console-bg,#fff)] hover:opacity-90 disabled:opacity-50",
  secondary:
    "border border-[var(--admin-console-border)] bg-[var(--admin-console-surface)] text-[var(--admin-console-fg)] hover:bg-[var(--admin-console-hover)] disabled:opacity-50",
  neutral:
    "border border-[var(--admin-console-border)] bg-transparent text-[var(--admin-console-fg)] hover:bg-[var(--admin-console-hover)] disabled:opacity-50",
  danger:
    "border border-red-700 bg-red-700 text-white hover:bg-red-800 disabled:opacity-50",
  ghost:
    "bg-transparent text-[var(--admin-console-accent,#5b21b6)] hover:underline disabled:opacity-50",
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
      data-admin-action={variant}
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
}: {
  href: string;
  variant?: AdminActionVariant;
  className?: string;
  children: ReactNode;
  prefetch?: boolean;
}) {
  return (
    <Link
      href={href}
      prefetch={prefetch}
      data-admin-action={variant}
      className={actionClassName(variant, className)}
    >
      {children}
    </Link>
  );
}
