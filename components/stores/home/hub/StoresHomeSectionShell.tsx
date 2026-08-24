"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { STORES_HOME_LINK, STORES_HOME_SECTION_TITLE } from "@/lib/stores/stores-home-ui";

export function StoresHomeSectionShell({
  title,
  subtitle,
  actionHref,
  actionLabel,
  children,
}: {
  title: string;
  subtitle?: string | null;
  actionHref?: string | null;
  actionLabel?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className={STORES_HOME_SECTION_TITLE}>{title}</h2>
          {subtitle ?
            <p className="-mt-0.5 text-[13px] text-[color:var(--delivery-text-sub)]">{subtitle}</p>
          : null}
        </div>
        {actionHref && actionLabel ?
          <Link href={actionHref} prefetch={false} className={STORES_HOME_LINK}>
            {actionLabel}
          </Link>
        : null}
      </div>
      {children}
    </section>
  );
}
