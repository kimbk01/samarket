"use client";

import { AppBackButton } from "@/components/navigation/AppBackButton";

interface SettingsHeaderProps {
  title: string;
  backHref?: string;
}

export function SettingsHeader({ title, backHref = "/my" }: SettingsHeaderProps) {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-gray-200 bg-white px-4 py-3">
      <AppBackButton backHref={backHref} ariaLabel="뒤로" />
      <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
    </header>
  );
}
