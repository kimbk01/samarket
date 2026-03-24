"use client";

import { HomeCategoryChips } from "@/components/home/HomeCategoryChips";
import { HomeFeedView } from "@/components/home-feed/HomeFeedView";

export function HomeContent() {
  return (
    <div className="space-y-3">
      <HomeCategoryChips />
      <HomeFeedView />
    </div>
  );
}
