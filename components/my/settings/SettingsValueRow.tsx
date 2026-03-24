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
      className="flex items-center gap-3 border-b border-gray-100 px-4 py-3 text-left last:border-b-0"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center text-gray-500">
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-[15px] text-gray-900">{label}</span>
      <span className="text-[14px] text-gray-500">{value}</span>
      <ChevronRight />
    </Link>
  );
}

function ChevronRight() {
  return (
    <svg className="h-5 w-5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}
