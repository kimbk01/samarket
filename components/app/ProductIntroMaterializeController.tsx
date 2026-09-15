/**
 * Product Intro materialization only — NO Web visual First Entry.
 *
 * CASE B (B0 probe): Native owns the single application-owned First Entry surface.
 * Web refreshes LKG + pushes persistProductIntro for next cold; never paints a second Intro.
 */
"use client";

import { useEffect } from "react";
import { scheduleProductIntroCacheRefresh } from "@/lib/startup/product-intro-cache";

export function ProductIntroMaterializeController(): null {
  useEffect(() => {
    scheduleProductIntroCacheRefresh();
    const onVis = () => {
      if (document.visibilityState === "visible") scheduleProductIntroCacheRefresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  return null;
}
