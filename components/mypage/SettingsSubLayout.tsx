"use client";

import { MySubpageHeader } from "@/components/my/MySubpageHeader";

interface SettingsSubLayoutProps {
  title: string;
  children: React.ReactNode;
  backHref?: string;
}

export function SettingsSubLayout({
  title,
  children,
  backHref = "/my/settings",
}: SettingsSubLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader title={title} backHref={backHref} section="account" />
      <div className="mx-auto max-w-lg px-4 py-4">{children}</div>
    </div>
  );
}
