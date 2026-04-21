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

      className={`overflow-hidden rounded-ui-rect border border-sam-border bg-[var(--sub-bg)] px-4 py-4 shadow-sm md:px-5 md:py-5 ${className}`}

    >

      <div className="mb-4">

        <h2 className="sam-text-section-title font-semibold text-sam-fg">{tt(title)}</h2>

        {description ? (

          <p className="mt-1 sam-text-helper leading-relaxed text-sam-muted">{tt(description)}</p>

        ) : null}

      </div>

      {children}

    </section>

  );

}

