"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";



export function TradeHubSectionShell({

  title,

  description,

  children,

  className = "",

}: {

  title: string;

  description?: string;

  children: ReactNode;

  className?: string;

}) {
  const { tt } = useI18n();

  return (

    <section

      className={`overflow-hidden rounded-[4px] border border-ig-border bg-[var(--sub-bg)] px-4 py-4 shadow-sm md:px-5 md:py-5 ${className}`}

    >

      <div className="mb-4">

        <h2 className="text-[17px] font-semibold text-gray-900">{tt(title)}</h2>

        {description ? (

          <p className="mt-1 text-[12px] leading-relaxed text-gray-500">{tt(description)}</p>

        ) : null}

      </div>

      {children}

    </section>

  );

}

