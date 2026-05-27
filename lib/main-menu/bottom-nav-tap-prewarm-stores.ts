"use client";

import {
  prewarmStoresHomeRoute,
  type StoresHomeRoutePrewarmOptions,
} from "@/lib/stores/stores-home-route-prewarm";

export type BottomNavStoresPrewarmOptions = StoresHomeRoutePrewarmOptions;

export function prewarmBottomNavStoresTab(opts: BottomNavStoresPrewarmOptions = {}): void {
  prewarmStoresHomeRoute(opts);
}
