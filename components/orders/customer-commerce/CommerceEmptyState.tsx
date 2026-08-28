"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Sam } from "@/lib/ui/sam-component-classes";

export function CommerceEmptyState({
  icon,
  title,
  description,
  ctaHref,
  ctaLabel,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  ctaHref?: string;
  ctaLabel?: string;
}) {
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-8 text-center"
      data-commerce-empty-state="1"
    >
      {icon ? <div className="text-2xl text-sam-muted">{icon}</div> : null}
      <p className="text-sm font-semibold text-sam-fg">{title}</p>
      {description ? <p className="text-sm text-sam-muted">{description}</p> : null}
      {ctaHref && ctaLabel ? (
        <Link
          href={ctaHref}
          prefetch={false}
          className={`${Sam.btn.primary} inline-flex min-h-[48px] items-center justify-center px-4 text-sm`}
        >
          {ctaLabel}
        </Link>
      ) : null}
    </div>
  );
}
