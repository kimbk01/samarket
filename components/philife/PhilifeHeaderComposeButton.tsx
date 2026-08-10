"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { buildPhilifeComposeHref } from "@/lib/philife/compose-href";
import { usePhilifeWriteSheet } from "@/contexts/PhilifeWriteSheetContext";
import { useInlineWriteSheetNavigationGuard } from "@/lib/navigation/use-inline-write-sheet-navigation-guard";
import { useRequireAuthAction } from "@/hooks/use-require-auth-action";
import {
  SAM_TIER1_HEADER_ICON_GLYPH_CLASS,
  SAM_TIER1_HEADER_ICON_HIT_CLASS,
  samTier1HeaderIconMicro,
} from "@/lib/ui/tier1-header-icon";

/**
 * `/philife` 1단 헤더 — 사각 연필(스타벅스 그린 배경) 글쓰기 CTA.
 */
export function PhilifeHeaderComposeButton() {
  return (
    <Suspense fallback={<PhilifeHeaderComposeButtonFallback />}>
      <PhilifeHeaderComposeButtonInner />
    </Suspense>
  );
}

/** 스타벅스 그린 사각 히트 — 커뮤니티 스코프 `--cm-primary` / 전역 폴백 `#006241` */
const COMPOSE_BTN_CLASS = [
  SAM_TIER1_HEADER_ICON_HIT_CLASS,
  "community-tier1-header-compose inline-flex shrink-0 items-center justify-center rounded-[9px]",
  "bg-[var(--cm-primary,#006241)] text-white",
  "hover:bg-[var(--cm-primary-hover,#00754a)]",
  "disabled:opacity-50",
  samTier1HeaderIconMicro,
].join(" ");

function PhilifeHeaderComposeButtonFallback() {
  const { t } = useI18n();
  return (
    <button
      type="button"
      className={COMPOSE_BTN_CLASS}
      aria-label={t("tier1_community_write")}
      disabled
    >
      <SquarePencilIcon />
    </button>
  );
}

function PhilifeHeaderComposeButtonInner() {
  const { t } = useI18n();
  const { open: openWriteSheet } = usePhilifeWriteSheet();
  const { guardBeforeNavigate } = useInlineWriteSheetNavigationGuard();
  const requireAuth = useRequireAuthAction();
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
        prefetch={false}
        className={COMPOSE_BTN_CLASS}
        aria-label={aria}
        onClick={(e) => {
          if (!guardBeforeNavigate()) {
            e.preventDefault();
            return;
          }
          e.preventDefault();
          void requireAuth(
            "community_write",
            () => {
              window.location.assign(href);
            },
            { next: href },
          );
        }}
      >
        <SquarePencilIcon />
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
      className={COMPOSE_BTN_CLASS}
      aria-label={aria}
    >
      <SquarePencilIcon />
    </button>
  );
}

function SquarePencilIcon() {
  return (
    <svg
      className={SAM_TIER1_HEADER_ICON_GLYPH_CLASS}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.1}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12.5 5.5l6 6L9 21H3v-6L12.5 5.5z" />
      <path d="M10.5 7.5l6 6" />
    </svg>
  );
}
