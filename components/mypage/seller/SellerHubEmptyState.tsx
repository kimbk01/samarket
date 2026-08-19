"use client";

import type { ReactNode } from "react";
import Link from "next/link";

export function SellerHubEmptyState({
  message,
  hint,
  actions,
}: {
  message: string;
  hint?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
      <p className="sam-text-body text-sam-fg">{message}</p>
      {hint ? <p className="sam-text-helper text-sam-muted">{hint}</p> : null}
      {actions ? <div className="mt-1 flex w-full max-w-xs flex-col gap-2">{actions}</div> : null}
    </div>
  );
}

export function SellerHubEmptyActionButton({
  onClick,
  children,
  variant = "primary",
}: {
  onClick?: () => void;
  children: ReactNode;
  variant?: "primary" | "secondary";
}) {
  const cls =
    variant === "primary"
      ? "sam-btn sam-btn--primary sam-btn--block w-full"
      : "sam-btn sam-btn--secondary sam-btn--block w-full";
  return (
    <button type="button" className={cls} onClick={onClick}>
      {children}
    </button>
  );
}

export function SellerHubEmptyActionLink({
  href,
  children,
  variant = "secondary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
}) {
  const cls =
    variant === "primary"
      ? "sam-btn sam-btn--primary sam-btn--block w-full text-center"
      : "sam-btn sam-btn--secondary sam-btn--block w-full text-center";
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}
