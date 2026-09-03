/**
 * Owner/Admin product CTA destinations for Platform Popup.
 * Maps human destinations (store / menu / promo) ↔ canonical CTA storage.
 * Does not invent DB enum values: uses existing store | internal_page.
 *
 * Product meaning lock (not row-level entity pickers):
 * - store → store detail
 * - menu → store detail menu section (#menu)
 * - promotion → store detail promotions area (?tab=promo)
 */

import { normalizePlatformPopupCta } from "@/lib/platform-popup/cta";
import type { PlatformPopupCtaType } from "@/lib/platform-popup/types";

/** Product UX kinds — store sections only (not per-menu / per-promo row IDs). */
export const PLATFORM_POPUP_OWNER_CTA_KINDS = ["store", "menu", "promotion"] as const;
export type PlatformPopupOwnerCtaKind = (typeof PLATFORM_POPUP_OWNER_CTA_KINDS)[number];

export type PlatformPopupCtaStored = {
  ctaType: PlatformPopupCtaType;
  ctaTarget: string;
  externalUrl: string | null;
  href: string;
};

export function isPlatformPopupOwnerCtaKind(v: string): v is PlatformPopupOwnerCtaKind {
  return (PLATFORM_POPUP_OWNER_CTA_KINDS as readonly string[]).includes(v);
}

function storePath(storeId: string): string {
  return `/stores/${encodeURIComponent(storeId.trim())}`;
}

/** Encode Owner/Admin product radio → canonical stored CTA (structural; entity gate on submit). */
export function encodePlatformPopupOwnerCtaDestination(input: {
  kind: PlatformPopupOwnerCtaKind;
  storeId: string;
}):
  | { ok: true; value: PlatformPopupCtaStored }
  | { ok: false; error: string } {
  const storeId = input.storeId.trim();
  if (!storeId) return { ok: false, error: "store_required" };

  if (input.kind === "store") {
    const v = normalizePlatformPopupCta({ ctaType: "store", ctaTarget: storeId });
    if (!v.ok) return v;
    return { ok: true, value: v.value };
  }

  const path =
    input.kind === "menu" ? `${storePath(storeId)}#menu` : `${storePath(storeId)}?tab=promo`;
  const v = normalizePlatformPopupCta({ ctaType: "internal_page", ctaTarget: path });
  if (!v.ok) return v;
  return { ok: true, value: v.value };
}

/** Decode stored CTA → product radio (best-effort; unknown → store). */
export function decodePlatformPopupOwnerCtaDestination(input: {
  ctaType: string;
  ctaTarget: string;
  storeId: string;
}): PlatformPopupOwnerCtaKind {
  const type = String(input.ctaType ?? "").trim().toLowerCase();
  const target = String(input.ctaTarget ?? "").trim();
  const storeId = input.storeId.trim();

  if (type === "store") return "store";
  if (type === "internal_page") {
    if (/#menu\b/i.test(target) || /\/menu(?:\/|$|\?)/i.test(target)) return "menu";
    if (/[?&]tab=promo\b/i.test(target) || /promo/i.test(target)) return "promotion";
    if (storeId && target.includes(storeId)) return "store";
  }
  return "store";
}

export function platformPopupOwnerCtaKindLabel(
  kind: PlatformPopupOwnerCtaKind,
  lang: "ko" | "en"
): string {
  if (lang === "en") {
    if (kind === "store") return "Go to store";
    if (kind === "menu") return "Go to store menu section";
    return "Go to store promotions";
  }
  if (kind === "store") return "매장으로 이동";
  if (kind === "menu") return "매장 메뉴 영역으로 이동";
  return "매장 프로모션 영역으로 이동";
}

export function describePlatformPopupCtaDestination(input: {
  ctaType: string;
  ctaTarget: string;
  storeId?: string | null;
  storeName?: string | null;
  lang?: "ko" | "en";
}): { kind: PlatformPopupOwnerCtaKind; label: string; href: string; readable: string } {
  const lang = input.lang ?? "ko";
  const storeId = (input.storeId ?? "").trim();
  const kind = decodePlatformPopupOwnerCtaDestination({
    ctaType: input.ctaType,
    ctaTarget: input.ctaTarget,
    storeId,
  });
  const encoded = storeId
    ? encodePlatformPopupOwnerCtaDestination({ kind, storeId })
    : normalizePlatformPopupCta({
        ctaType: input.ctaType,
        ctaTarget: input.ctaTarget,
      });
  const href = encoded.ok ? encoded.value.href : "";
  const storeLabel = (input.storeName ?? "").trim() || storeId || "—";
  const readable =
    lang === "en"
      ? kind === "store"
        ? `Store · ${storeLabel}`
        : kind === "menu"
          ? `Store menu section · ${storeLabel}`
          : `Store promotions · ${storeLabel}`
      : kind === "store"
        ? `매장 · ${storeLabel}`
        : kind === "menu"
          ? `매장 메뉴 영역 · ${storeLabel}`
          : `매장 프로모션 영역 · ${storeLabel}`;
  return {
    kind,
    label: platformPopupOwnerCtaKindLabel(kind, lang),
    href,
    readable,
  };
}
