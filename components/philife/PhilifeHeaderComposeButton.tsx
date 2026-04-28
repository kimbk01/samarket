"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { buildPhilifeComposeHref } from "@/lib/philife/compose-href";
import { philifeAppPaths } from "@/lib/philife/paths";
import { usePhilifeWriteSheet } from "@/contexts/PhilifeWriteSheetContext";
import { useInlineWriteSheetNavigationGuard } from "@/lib/navigation/use-inline-write-sheet-navigation-guard";

/**
 * `/philife` 1단 헤더 — 페이스북형 **둥근 사각형 +** 글쓰기(기존 하단 FAB 대체).
 */
export function PhilifeHeaderComposeButton() {
  return (
    <Suspense fallback={<PhilifeHeaderComposeButtonFallback />}>
      <PhilifeHeaderComposeButtonInner />
    </Suspense>
  );
}

function PhilifeHeaderComposeButtonFallback() {
  const { t } = useI18n();
  return (
    <Link
      href={philifeAppPaths.write}
      className="sam-header-action h-10 w-10 shrink-0 text-sam-fg transition-[transform,background-color,opacity] duration-300 ease-out active:duration-100 active:scale-[0.88] active:bg-sam-surface-muted active:opacity-85"
      aria-label={t("tier1_community_write")}
    >
      <PlusInSquareIcon />
    </Link>
  );
}

function PhilifeHeaderComposeButtonInner() {
  const { t } = useI18n();
  const { open: openWriteSheet } = usePhilifeWriteSheet();
  const { guardBeforeNavigate } = useInlineWriteSheetNavigationGuard();
  const searchParams = useSearchParams();
  const category = searchParams.get("category")?.trim() ?? "";
  const href = buildPhilifeComposeHref(category);
  const meetup = category === "meetup";
  const aria =
    meetup ? `${t("neighborhood_meetup")} ${t("nav_write_aria")}`.trim() : t("tier1_community_write");

  if (meetup) {
    return (
      <Link
        href={href}
        className="sam-header-action h-10 w-10 shrink-0 text-sam-fg transition-[transform,background-color,opacity] duration-300 ease-out active:duration-100 active:scale-[0.88] active:bg-sam-surface-muted active:opacity-85"
        aria-label={aria}
        onClick={(e) => {
          if (!guardBeforeNavigate()) e.preventDefault();
        }}
      >
        <PlusInSquareIcon />
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        if (!guardBeforeNavigate()) return;
        openWriteSheet(category);
      }}
      className="sam-header-action h-10 w-10 shrink-0 text-sam-fg transition-[transform,background-color,opacity] duration-300 ease-out active:duration-100 active:scale-[0.88] active:bg-sam-surface-muted active:opacity-85"
      aria-label={aria}
    >
      <PlusInSquareIcon />
    </button>
  );
}

function PlusInSquareIcon() {
  return (
    <svg
      className="h-6 w-6"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      aria-hidden
    >
      <rect x="3" y="3" width="18" height="18" rx="4" ry="4" strokeWidth={2} />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}
