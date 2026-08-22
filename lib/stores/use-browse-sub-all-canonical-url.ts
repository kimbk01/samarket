"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import { storesBrowseAllPath } from "@/components/stores/browse/stores-browse-paths";
import { shouldCanonicalizeBrowseSubToAll } from "@/lib/stores/browse-header-sub-selection";
import type { BrowseSubIndustry } from "@/lib/stores/browse-taxonomy-ui-types";

/**
 * browse 진입·새로고침·1차 전환 — `sub` 없음·비정상 → `?sub=all` (목록 1차 전체).
 * 2차 「전체」 칩 UI 없음 — `sub=all` 일 때 2차 칩은 모두 비선택.
 */
export function useBrowseSubAllCanonicalUrl(
  primarySlug: string,
  subs: BrowseSubIndustry[],
  opts?: { enabled?: boolean },
): void {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const enabled = opts?.enabled ?? true;

  const trimmedSub = useMemo(() => {
    const sp = searchParams?.get("sub");
    return sp?.trim().toLowerCase() ?? "";
  }, [searchParams]);

  useEffect(() => {
    if (!enabled || !primarySlug.trim()) return;
    const pathOnly = (pathname ?? "").split("?")[0] ?? "";
    /** Parked browse under store detail must not rewrite URL back to browse. */
    if (pathOnly !== "/stores/browse" && !pathOnly.startsWith("/stores/browse/")) return;
    if (!shouldCanonicalizeBrowseSubToAll(trimmedSub, subs)) return;

    const target = storesBrowseAllPath(primarySlug);
    const currentPath = pathname ?? "";
    const currentQs = searchParams?.toString() ?? "";
    const current = currentQs ? `${currentPath}?${currentQs}` : currentPath;
    if (current === target) return;

    router.replace(target, { scroll: false });
  }, [enabled, primarySlug, trimmedSub, subs, pathname, searchParams, router]);
}
