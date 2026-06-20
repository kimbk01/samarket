"use client";

import { useEffect } from "react";
import { markBootMetricsThumbnailVisible } from "@/lib/app-boot/dibay-boot-metrics";

/** 첫 썸네일(img) complete 시 boot metrics 기록. */
export function BootThumbnailObserver() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const seen = new WeakSet<Element>();
    const onLoad = (ev: Event) => {
      const t = ev.target;
      if (!(t instanceof HTMLImageElement)) return;
      if (seen.has(t)) return;
      seen.add(t);
      markBootMetricsThumbnailVisible();
    };
    document.addEventListener("load", onLoad, true);
    const imgs = document.querySelectorAll("img");
    for (const img of imgs) {
      if (img.complete && img.naturalWidth > 0) {
        markBootMetricsThumbnailVisible();
        break;
      }
    }
    return () => document.removeEventListener("load", onLoad, true);
  }, []);
  return null;
}
