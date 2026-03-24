"use client";

import Link from "next/link";

interface SettingsDangerRowProps {
  href: string;
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
}

export function SettingsDangerRow({ href, icon, label, danger = true }: SettingsDangerRowProps) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 border-b border-gray-100 px-4 py-3 text-left last:border-b-0 ${
        danger ? "text-red-600" : "text-gray-900"
      }`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center text-current opacity-80">
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-[15px]">{label}</span>
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
