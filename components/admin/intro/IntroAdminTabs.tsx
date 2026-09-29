"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Sam } from "@/lib/ui/css-vars";

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
      className="mb-6 flex flex-wrap gap-2 border-b border-sam-border pb-3"
      data-intro13-admin-tabs="1"
      aria-label="인트로 운영"
    >
      {TABS.map((tab) => {
        const selected = tab.id === active;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            className={
              selected
                ? `${Sam.btn.primary} text-sm`
                : `${Sam.btn.secondary} text-sm`
            }
            aria-current={selected ? "page" : undefined}
          >
            {tab.label}
          </Link>
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
