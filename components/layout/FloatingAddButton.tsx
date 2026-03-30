"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
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
  const [launcherOpen, setLauncherOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const writeCtx = useWriteCategory();
  const writeCategorySlug = writeCtx?.writeCategorySlug ?? null;
  const launcherCategoriesLoading = writeCtx?.launcherCategoriesLoading ?? true;
  const hasLauncherTopics = (writeCtx?.launcherRootCategories?.length ?? 0) > 0;
  const pathSlug = getCategorySlugFromPath(pathname ?? "");
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
    setLauncherOpen(true);
  };

  return (
    <>
      {!launcherOpen ? (
        <button
          type="button"
          onClick={handleClick}
          className={`kasama-quick-add fixed ${BOTTOM_NAV_FAB_LAYOUT.bottomOffsetClass} ${BOTTOM_NAV_FAB_LAYOUT.leftOffsetClass} z-[21] flex h-14 w-14 items-center justify-center rounded-full bg-signature text-white shadow-lg`}
          aria-label="글쓰기"
        >
          <PlusIcon />
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
