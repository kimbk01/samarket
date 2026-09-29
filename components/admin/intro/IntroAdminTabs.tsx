"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { AdminActionLink } from "@/components/admin/ui/AdminActionButton";

export type IntroAdminTab = "intros" | "system-start" | "media";

const TABS: { id: IntroAdminTab; label: string; href: string }[] = [
  { id: "intros", label: "인트로 관리", href: "/admin/intro" },
  {
    id: "system-start",
    label: "시스템 시작 화면",
    href: "/admin/intro?tab=system-start",
  },
  { id: "media", label: "미디어", href: "/admin/intro?tab=media" },
];

export function IntroAdminTabs({ active }: { active: IntroAdminTab }) {
  const pathname = usePathname();
  const isEditor =
    pathname?.startsWith("/admin/intro/") && pathname !== "/admin/intro";

  if (isEditor) return null;

  return (
    <nav
      className="mb-6 flex flex-wrap gap-2 border-b border-[var(--admin-console-border,#d0d7e2)] pb-3"
      data-intro13-admin-tabs="1"
      aria-label="인트로 운영"
    >
      {TABS.map((tab) => {
        const selected = tab.id === active;
        return (
          <AdminActionLink
            key={tab.id}
            href={tab.href}
            variant={selected ? "primary" : "secondary"}
            className="text-sm"
            aria-current={selected ? "page" : undefined}
          >
            {tab.label}
          </AdminActionLink>
        );
      })}
    </nav>
  );
}

export function useIntroAdminTab(): IntroAdminTab {
  const search = useSearchParams();
  const tab = search.get("tab");
  if (tab === "system-start") return "system-start";
  if (tab === "media") return "media";
  return "intros";
}
