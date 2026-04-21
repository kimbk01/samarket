"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";

export function MyPageMobileFold({
  title,
  summary,
  children,
  defaultOpenMobile = false,
}: {
  title: string;
  summary?: string;
  children: ReactNode;
  defaultOpenMobile?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpenMobile);

  useEffect(() => {
    setOpen(defaultOpenMobile);
  }, [defaultOpenMobile, title]);

  return (
    <section className="rounded-ui-rect border border-sam-border bg-sam-surface">
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <h3 className="sam-text-body font-semibold text-sam-fg">{title}</h3>
          {summary ? <p className="mt-1 sam-text-helper leading-5 text-sam-muted">{summary}</p> : null}
        </div>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className="inline-flex h-7 min-w-7 items-center justify-center rounded-ui-rect border border-sam-border px-2 sam-text-body font-semibold text-sam-fg md:hidden"
        >
          {open ? "-" : "+"}
        </button>
      </div>
      <div className={`${open ? "block" : "hidden"} border-t border-sam-border-soft px-4 py-3 md:block`}>
        {children}
      </div>
    </section>
  );
}
