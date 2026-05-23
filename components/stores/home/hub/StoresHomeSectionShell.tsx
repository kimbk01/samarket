"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { STORES_HOME_LINK, STORES_HOME_SECTION_TITLE } from "@/lib/stores/stores-home-ui";

export function StoresHomeSectionShell({
  title,
  actionHref,
  actionLabel,
  children,
}: {
  title: string;
  actionHref?: string;
  actionLabel?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h2 className={STORES_HOME_SECTION_TITLE}>{title}</h2>
        {actionHref && actionLabel ?
          <Link href={actionHref} className={STORES_HOME_LINK}>
            {actionLabel}
          </Link>
        : null}
      </div>
      {children}
    </section>
  );
}
