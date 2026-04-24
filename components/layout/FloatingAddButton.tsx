"use client";

import { usePathname, useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useWriteCategory } from "@/contexts/WriteCategoryContext";
import { BOTTOM_NAV_FAB_LAYOUT } from "@/lib/main-menu/bottom-nav-config";
import { isTradeFloatingMenuSurface } from "@/lib/layout/mobile-top-tier1-rules";

export function FloatingAddButton() {
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const writeCtx = useWriteCategory();
  const launcherCategoriesLoading = writeCtx?.launcherCategoriesLoading ?? true;
  const hasLauncherTopics = (writeCtx?.launcherRootCategories?.length ?? 0) > 0;
  const hideFabOnTradeSurface = isTradeFloatingMenuSurface(pathname);

  /** 거래 탭 표면은 FAB를 숨기고 상단 `+` 메뉴로 통일 */
  if (hideFabOnTradeSurface) {
    return null;
  }

  /** 어드민에서 런처 항목을 모두 끈 경우 좌측 FAB 숨김 */
  if (!launcherCategoriesLoading && !hasLauncherTopics) {
    return null;
  }

  const handleClick = () => {
    writeCtx?.ensureLauncherCategoriesLoaded();
    router.push("/write");
  };

  const isCommunityFab =
    pathname === "/community" || (typeof pathname === "string" && pathname.startsWith("/community/"));

  const fabButtonClass = isCommunityFab
    ? `kasama-quick-add fixed ${BOTTOM_NAV_FAB_LAYOUT.bottomOffsetClass} ${BOTTOM_NAV_FAB_LAYOUT.leftOffsetClass} z-[21] flex h-14 w-14 items-center justify-center rounded-sam-md border border-sam-border bg-sam-surface text-sam-fg shadow-sam-elevated transition active:scale-[0.98] active:opacity-95`
    : `kasama-quick-add fixed ${BOTTOM_NAV_FAB_LAYOUT.bottomOffsetClass} ${BOTTOM_NAV_FAB_LAYOUT.leftOffsetClass} z-[21] flex h-14 w-14 items-center justify-center rounded-sam-md border border-sam-primary bg-sam-primary text-white shadow-sam-elevated transition active:scale-[0.98] active:opacity-95`;

  return (
    <>
      <button type="button" onClick={handleClick} className={fabButtonClass} aria-label={t("nav_write_aria")}>
        {isCommunityFab ? <PencilIcon /> : <PlusIcon />}
      </button>
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
