"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ManagedMyCtaLink } from "@/lib/my/managed-my-section-ctas";
import { APP_MAIN_HEADER_INNER_CLASS } from "@/lib/ui/app-content-layout";

type Props = {
  links: ManagedMyCtaLink[];
  /** 비우면 라벨 행 없음(기본 없음) */
  label?: string | null;
};

export function MyManagedCtaStrip({ links, label }: Props) {
  const pathname = usePathname() ?? "";

  if (links.length === 0) return null;

  const labelText = typeof label === "string" ? label.trim() : "";

  return (
    <div className="w-full min-w-0 overflow-x-hidden border-b border-sam-border bg-background">
      <div className={`${APP_MAIN_HEADER_INNER_CLASS} min-w-0 py-2`}>
        {labelText ? (
          <p className="mb-1.5 px-1 sam-text-xxs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            {labelText}
          </p>
        ) : null}
        <div className="flex min-w-0 gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {links.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/mypage" && item.href !== "/community" && pathname.startsWith(`${item.href}/`));
            return (
              <Link
                key={item.href + item.label}
                href={item.href}
                className={`shrink-0 rounded-full border px-3 py-1.5 sam-text-helper font-semibold transition-colors ${
                  active
                    ? "border-foreground bg-foreground text-[var(--sub-bg)]"
                    : "border-sam-border bg-[var(--sub-bg)] text-foreground active:bg-sam-primary-soft"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
