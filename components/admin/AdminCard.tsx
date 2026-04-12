"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function AdminCard({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { tt } = useI18n();
  return (
    <div className={`rounded-ui-rect border border-sam-border bg-sam-surface ${className}`}>
      {title && (
        <div className="border-b border-sam-border-soft px-4 py-3">
          <h2 className="text-[15px] font-medium text-sam-fg">{tt(title)}</h2>
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}
