"use client";

import Link from "next/link";

export function BusinessDashboardQuickRow({
  links,
}: {
  links: { label: string; href: string }[];
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-[15px] font-semibold text-sam-fg">빠른 실행</h2>
      <div className="flex flex-wrap gap-2">
        {links.map((l) => (
          <Link
            key={l.href + l.label}
            href={l.href}
            className="rounded-full border border-sam-border bg-sam-surface px-3 py-2 text-[13px] font-medium text-sam-fg shadow-sm hover:border-signature/30 hover:bg-signature/5"
          >
            {l.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
