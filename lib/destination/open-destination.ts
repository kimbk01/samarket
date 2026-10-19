"use client";

/**
 * Scope B — the one way every CTA opens its destination (EVT-04).
 * internal / event → app router (same WebView). external → in-app browser on native
 * (@capacitor/browser, already in installed binaries), new tab on the web. Never navigates
 * the app WebView to a foreign origin.
 */
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import {
  destinationHref,
  parseDestinationHref,
  type DestinationRef,
} from "@/lib/destination/destination-contract";

type RouterLike = { push: (href: string) => void };

export async function openExternalUrl(url: string): Promise<void> {
  if (!url.startsWith("https://")) return;
  if (!isCapacitorNativePlatform()) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  try {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url });
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/** @returns false when the destination is invalid (caller keeps the user where they are). */
export function openDestination(target: DestinationRef | string, router: RouterLike): boolean {
  let ref: DestinationRef;
  if (typeof target === "string") {
    const parsed = parseDestinationHref(target);
    if (!parsed.ok) return false;
    ref = parsed.ref;
  } else {
    ref = target;
  }
  if (ref.kind === "external_url") {
    void openExternalUrl(ref.url);
    return true;
  }
  router.push(destinationHref(ref));
  return true;
}
