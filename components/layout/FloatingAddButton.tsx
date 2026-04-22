"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { WriteLauncher } from "@/components/write-launcher/WriteLauncher";
import { useWriteCategory } from "@/contexts/WriteCategoryContext";
import { BOTTOM_NAV_FAB_LAYOUT } from "@/lib/main-menu/bottom-nav-config";

const CATEGORY_PREFIXES = ["/market/", "/community/", "/philife/", "/services/", "/features/"];

function getCategorySlugFromPath(pathname: string): string | null {
  for (const prefix of CATEGORY_PREFIXES) {
    if (pathname.startsWith(prefix)) {
      const slug = pathname.slice(prefix.length).replace(/\/.*$/, "").trim();
      return slug || null;
    }
  }
  return null;
}

export function FloatingAddButton() {
  const { t } = useI18n();
  const [launcherOpen, setLauncherOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const writeCtx = useWriteCategory();
  const writeCategorySlug = writeCtx?.writeCategorySlug ?? null;
  const launcherCategoriesLoading = writeCtx?.launcherCategoriesLoading ?? true;
  const hasLauncherTopics = (writeCtx?.launcherRootCategories?.length ?? 0) > 0;
  const pathSlug = useMemo(() => getCategorySlugFromPath(pathname ?? ""), [pathname]);
  const categorySlug = writeCategorySlug ?? pathSlug;

  /** 어드민에서 런처 항목을 모두 끈 경우 좌측 FAB 숨김(현재 화면 주제로 바로 쓰기 가능할 때만 유지) */
  if (!launcherCategoriesLoading && !categorySlug && !hasLauncherTopics) {
    return null;
  }

  const handleClick = () => {
    if (categorySlug) {
      router.push(`/write/${encodeURIComponent(categorySlug)}`);
      return;
    }
    writeCtx?.ensureLauncherCategoriesLoaded();
    setLauncherOpen(true);
  };

  const isCommunityFab =
    pathname === "/community" || (typeof pathname === "string" && pathname.startsWith("/community/"));

  const fabButtonClass = isCommunityFab
    ? `kasama-quick-add fixed ${BOTTOM_NAV_FAB_LAYOUT.bottomOffsetClass} ${BOTTOM_NAV_FAB_LAYOUT.leftOffsetClass} z-[21] flex h-14 w-14 items-center justify-center rounded-ui-rect border-2 border-sam-border bg-white text-sam-fg shadow-sam-elevated transition active:scale-[0.98] active:opacity-95`
    : `kasama-quick-add fixed ${BOTTOM_NAV_FAB_LAYOUT.bottomOffsetClass} ${BOTTOM_NAV_FAB_LAYOUT.leftOffsetClass} z-[21] flex h-14 w-14 items-center justify-center rounded-full bg-signature text-white shadow-sam-elevated`;

  return (
    <>
      {!launcherOpen ? (
        <button type="button" onClick={handleClick} className={fabButtonClass} aria-label={t("nav_write_aria")}>
          {isCommunityFab ? <PencilIcon /> : <PlusIcon />}
        </button>
      ) : null}
      {launcherOpen ? <WriteLauncher onClose={() => setLauncherOpen(false)} /> : null}
    </>
  );
}

function PlusIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
      />
    </svg>
  );
}
