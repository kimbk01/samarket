"use client";

import { useLayoutEffect } from "react";
import { enterOwnerDashboardWaterfallPage } from "@/lib/business/owner-dashboard-waterfall";

/** `/stores/owner` 허브 — waterfall page_mount (관측만). */
export function OwnerDashboardWaterfallMount() {
  useLayoutEffect(() => {
    enterOwnerDashboardWaterfallPage();
  }, []);
  return null;
}
