"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { MYINFO_SURFACE, MYINFO_TYPO } from "./myinfo-theme";

export function MyInfoMenuItem({
  title,
  description,
  href,
  icon,
  accessory,
  tone = "default",
}: {
  title: string;
  description?: string;
  href: string;
  icon?: ReactNode;
  accessory?: ReactNode;
  tone?: "default" | "danger";
}) {
  const titleClass =
    tone === "danger" ? "text-sam-danger" : "text-sam-fg";

  return (
    <Link
      href={href}
      className={`flex ${MYINFO_SURFACE.row} w-full min-w-0 items-center gap-3 px-4 py-3 transition-colors hover:bg-sam-app active:bg-sam-app`}
    >
      {icon ? (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-sam-app text-sam-fg">
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className={`block truncate ${MYINFO_TYPO.menuTitle} ${titleClass}`}>
          {title}
        </span>
        {description?.trim() ? (
          <span className={`mt-0.5 block truncate ${MYINFO_TYPO.subText}`}>
            {description.trim()}
          </span>
        ) : null}
      </span>
      {accessory ? (
        <span className="shrink-0 sam-text-body-secondary text-sam-muted">
          {accessory}
        </span>
      ) : null}
      <ChevronRight className="h-[18px] w-[18px] shrink-0 text-sam-meta" strokeWidth={2} />
    </Link>
  );
}

