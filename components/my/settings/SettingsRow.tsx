"use client";

import Link from "next/link";

interface SettingsRowProps {
  href: string;
  icon: React.ReactNode;
  label: string;
  subtitle?: string;
  right?: React.ReactNode;
}

export function SettingsRow({ href, icon, label, subtitle, right }: SettingsRowProps) {
  const content = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center text-sam-muted">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] text-sam-fg">{label}</span>
        {subtitle && (
          <span className="block text-[12px] text-sam-muted">{subtitle}</span>
        )}
      </span>
      {right ?? <ChevronRight />}
    </>
  );
  return (
    <Link
      href={href}
      className="flex items-center gap-3 border-b border-sam-border-soft px-4 py-3 text-left last:border-b-0"
    >
      {content}
    </Link>
  );
}

function ChevronRight() {
  return (
    <svg className="h-5 w-5 shrink-0 text-sam-meta" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}
