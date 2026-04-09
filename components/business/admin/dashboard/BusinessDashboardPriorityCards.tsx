"use client";

import Link from "next/link";

type Card = {
  title: string;
  description: string;
  href: string;
  badge?: string;
  tone?: "default" | "accent" | "danger" | "warning";
};

export function BusinessDashboardPriorityCards({ cards }: { cards: Card[] }) {
  return (
    <section className="space-y-2">
      <h2 className="px-0.5 text-[15px] font-semibold text-gray-900">지금 바로 처리</h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {cards.map((c) => {
          const toneClass =
            c.tone === "accent"
              ? "border-signature/25 bg-signature/5"
              : c.tone === "danger"
                ? "border-rose-200 bg-rose-50/80"
                : c.tone === "warning"
                  ? "border-amber-200 bg-amber-50/80"
                  : "border-gray-200 bg-white";
          return (
            <Link
              key={c.href + c.title}
              href={c.href}
              className={`flex items-start justify-between gap-3 rounded-ui-rect border px-4 py-3 shadow-sm ${toneClass}`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-[15px] font-semibold text-gray-900">{c.title}</p>
                  {c.badge ? (
                    <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white">{c.badge}</span>
                  ) : null}
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-gray-600">{c.description}</p>
              </div>
              <span className="shrink-0 text-gray-400" aria-hidden>
                →
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
