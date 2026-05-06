"use client";

import type { ReactNode } from "react";

export function ProfileEditFormShell({
  children,
}: {
  children: ReactNode;
}) {
  return <div className="mx-auto w-full max-w-[720px] space-y-4 px-4 pb-24">{children}</div>;
}

export function ProfileEditSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="space-y-0.5">
        <h2 className="text-[14px] font-bold leading-tight text-sam-fg">{title}</h2>
        {description?.trim() ? (
          <p className="text-[13px] font-normal leading-snug text-sam-muted">{description.trim()}</p>
        ) : null}
      </div>
      <div className="rounded-[12px] border border-sam-border bg-sam-surface p-4">
        {children}
      </div>
    </section>
  );
}

