"use client";

import Link from "next/link";

interface SettingsValueRowProps {
  href: string;
  icon: React.ReactNode;
  label: string;
  value: string;
}

export function SettingsValueRow({ href, icon, label, value }: SettingsValueRowProps) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 border-b border-sam-border-soft px-4 py-3 text-left last:border-b-0"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center text-sam-muted">
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-[15px] text-sam-fg">{label}</span>
      <span className="text-[14px] text-sam-muted">{value}</span>
      <ChevronRight />
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
