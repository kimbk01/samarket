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
    <section className="rounded-ui-rect border border-gray-200 bg-white">
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold text-gray-900">{title}</h3>
          {summary ? <p className="mt-1 text-[12px] leading-5 text-gray-500">{summary}</p> : null}
        </div>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className="inline-flex h-7 min-w-7 items-center justify-center rounded-ui-rect border border-gray-200 px-2 text-[14px] font-semibold text-gray-700 md:hidden"
        >
          {open ? "-" : "+"}
        </button>
      </div>
      <div className={`${open ? "block" : "hidden"} border-t border-gray-100 px-4 py-3 md:block`}>
        {children}
      </div>
    </section>
  );
}
