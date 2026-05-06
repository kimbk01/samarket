"use client";

import type { ReactNode } from "react";
import { MYINFO_SURFACE, MYINFO_TYPO } from "./myinfo-theme";

export function MyInfoMenuSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className={`${MYINFO_TYPO.sectionTitle} text-sam-fg`}>{title}</h2>
      <div className={`${MYINFO_SURFACE.card} overflow-hidden`}>
        <div className="divide-y divide-sam-border-soft">{children}</div>
      </div>
    </section>
  );
}

