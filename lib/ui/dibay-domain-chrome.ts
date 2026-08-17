/**
 * DIBAY global chrome — domain pale surface + secondary tab visual SSOT.
 * Geometry: image lock (Header 52/56 · Tab row 44 / item 36).
 * Domain via existing `resolveMainSurface` only — no parallel resolver.
 * FEATURE PRESERVATION: visual tokens only; do not add Header actions/tabs.
 */

import type { CSSProperties } from "react";
import type { MainSurfaceId } from "@/lib/layout/resolve-main-surface";
import { resolveMainSurface } from "@/lib/layout/resolve-main-surface";

/** Image SSOT pale surfaces (Header + Secondary chrome). */
export const DIBAY_DOMAIN_CHROME = {
  community: {
    surface: "#EBF2ED",
    accent: "#296044",
    accentText: "#FFFFFF",
    tabIdleBg: "#F4F8F6",
    tabIdleFg: "#243832",
    divider: "color-mix(in srgb, #243832 10%, transparent)",
  },
  trade: {
    surface: "#EAF3EE",
    accent: "#0B421A",
    accentText: "#FFFFFF",
    tabIdleBg: "#F3F8F5",
    tabIdleFg: "#243832",
    divider: "color-mix(in srgb, #243832 10%, transparent)",
  },
  delivery: {
    surface: "#F1F7EE",
    accent: "#296044",
    accentText: "#FFFFFF",
    tabIdleBg: "#F6FAF4",
    tabIdleFg: "#243832",
    divider: "color-mix(in srgb, #243832 10%, transparent)",
  },
  chat: {
    surface: "#EBF2FB",
    accent: "#296044",
    accentText: "#FFFFFF",
    tabIdleBg: "#F2F7FC",
    tabIdleFg: "#243832",
    divider: "color-mix(in srgb, #243832 10%, transparent)",
  },
  mypage: {
    surface: "#F3F2EB",
    accent: "#243832",
    accentText: "#FFFFFF",
    tabIdleBg: "#F7F6F2",
    tabIdleFg: "#243832",
    divider: "color-mix(in srgb, #243832 10%, transparent)",
  },
  other: {
    surface: "#F9F9F9",
    accent: "#243832",
    accentText: "#FFFFFF",
    tabIdleBg: "#F2F0EB",
    tabIdleFg: "#243832",
    divider: "color-mix(in srgb, #243832 8%, transparent)",
  },
} as const;

export type DibayDomainChromeId = keyof typeof DIBAY_DOMAIN_CHROME;

export function resolveDibayDomainChromeId(surface: MainSurfaceId): DibayDomainChromeId {
  if (surface === "other") return "other";
  return surface;
}

export function dibayDomainChromeCssVars(surface: MainSurfaceId): CSSProperties {
  const id = resolveDibayDomainChromeId(surface);
  const t = DIBAY_DOMAIN_CHROME[id];
  return {
    ["--dibay-domain-surface" as string]: t.surface,
    ["--dibay-domain-accent" as string]: t.accent,
    ["--dibay-domain-accent-text" as string]: t.accentText,
    ["--dibay-domain-tab-idle-bg" as string]: t.tabIdleBg,
    ["--dibay-domain-tab-idle-fg" as string]: t.tabIdleFg,
    ["--dibay-domain-divider" as string]: t.divider,
    ["--sector-header-bg" as string]: t.surface,
    ["--sector-header-border" as string]: t.divider,
    ["--sector-header-title-color" as string]: "#243832",
    ["--sector-header-icon-color" as string]: "#243832",
    ["--sector-header-back-color" as string]: "#243832",
    ["--sector-header-icon-active-color" as string]: t.accent,
  };
}

export function getDibayDomainChromeElementProps(pathname: string | null | undefined): {
  "data-dibay-domain": DibayDomainChromeId;
  style: CSSProperties;
} {
  const surface = resolveMainSurface(pathname);
  const id = resolveDibayDomainChromeId(surface);
  return {
    "data-dibay-domain": id,
    style: dibayDomainChromeCssVars(surface),
  };
}
