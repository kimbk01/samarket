"use client";

import Link from "next/link";

export function BusinessDashboardQuickRow({
  links,
}: {
  links: { label: string; href: string }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {links.map((l) => (
        <Link
          key={l.href + l.label}
          href={l.href}
          prefetch={false}
          className="flex min-h-[3rem] w-full items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-2.5 text-center sam-text-body-secondary font-semibold leading-snug text-sam-fg shadow-sm transition hover:border-signature/35 hover:bg-signature/[0.04]"
        >
          {l.label}
        </Link>
      ))}
    </div>
  );
}
