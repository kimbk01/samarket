"use client";

import { AppBackButton } from "@/components/navigation/AppBackButton";

interface AdminPageHeaderProps {
  title: string;
  backHref?: string;
  description?: string;
}

export function AdminPageHeader({ title, backHref, description }: AdminPageHeaderProps) {
  return (
    <div className="mb-4 flex flex-wrap items-start gap-3">
      {backHref ? <AppBackButton backHref={backHref} ariaLabel="목록으로" /> : null}
      <div className="min-w-0">
        <h1 className="text-[18px] font-semibold text-gray-900">{title}</h1>
        {description ? <p className="mt-1 text-[14px] text-gray-500">{description}</p> : null}
      </div>
    </div>
  );
}
