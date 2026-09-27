/**
 * CUT 1 operator Intro contract.
 * ONE published Intro = campaign identity + V1 native payload.
 * Frequency identity = campaign id (revision of same campaign = same Intro).
 */

import {
  PRODUCT_INTRO_ACTION_TYPES,
  PRODUCT_INTRO_DISPLAY_MS_DEFAULT,
  PRODUCT_INTRO_DISPLAY_MS_MAX,
  type ProductIntroAction,
  type ProductIntroConfig,
  type ProductIntroSizePreset,
} from "@/lib/startup/product-intro";
import { PRODUCT_INTRO_BUNDLED_CANVAS_BACKGROUND } from "@/lib/startup/product-intro-geometry";
import type {
  IntroAdminAsset,
  IntroAdminCampaign,
  IntroAdminScene,
} from "@/lib/startup/intro-v2/admin-editor-model";
import type { IntroCampaignStatus, IntroCta, IntroFrequencyMode, IntroLayer } from "@/lib/startup/intro-v2/types";

export const INTRO_OPERATOR_SOURCE_KEY = "operator_cut1" as const;

export const INTRO_OPERATOR_APP_STATES = [
  "published",
  "scheduled",
  "draft",
  "paused",
  "ended",
] as const;
export type IntroOperatorAppState = (typeof INTRO_OPERATOR_APP_STATES)[number];

export function introOperatorAppStateLabel(state: IntroOperatorAppState, lang: "ko" | "en"): string {
  const map: Record<IntroOperatorAppState, { ko: string; en: string }> = {
    published: { ko: "게시됨", en: "Published" },
    scheduled: { ko: "예약", en: "Scheduled" },
    draft: { ko: "초안", en: "Draft" },
    paused: { ko: "중지", en: "Paused" },
    ended: { ko: "종료 / 보관", en: "Ended / archived" },
  };
  return map[state][lang];
}

export const INTRO_OPERATOR_HOLD_MS_MIN = 1;

export function clampIntroHoldMs(value: unknown, fallback = PRODUCT_INTRO_DISPLAY_MS_DEFAULT): number {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(PRODUCT_INTRO_DISPLAY_MS_MAX, Math.max(INTRO_OPERATOR_HOLD_MS_MIN, Math.trunc(n)));
}

export function operatorSizePreset(value: unknown): ProductIntroSizePreset {
  if (value === "small" || value === "medium" || value === "large" || value === "max") return value;
  if (value === "full") return "max";
  return "max";
}

export function readOperatorSource(source: Record<string, unknown> | null | undefined): {
  sizePreset: ProductIntroSizePreset;
  showLogo: boolean;
  displayDurationMs: number;
} {
  const rec = source && typeof source === "object" ? source : {};
  return {
    sizePreset: operatorSizePreset(rec.sizePreset),
    showLogo: rec.showLogo !== false,
    displayDurationMs: clampIntroHoldMs(rec.displayDurationMs),
  };
}

export function operatorSourcePatch(input: {
  sizePreset: ProductIntroSizePreset;
  showLogo: boolean;
  displayDurationMs: number;
  previous?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    ...(input.previous ?? {}),
    [INTRO_OPERATOR_SOURCE_KEY]: true,
    sizePreset: input.sizePreset,
    showLogo: input.showLogo,
    displayDurationMs: clampIntroHoldMs(input.displayDurationMs),
  };
}

export function findOperatorImageAsset(
  campaign: Pick<IntroAdminCampaign, "scenes" | "assets">
): IntroAdminAsset | null {
  const first = campaign.scenes[0];
  const imageLayer = first?.layers.find((layer) => layer.type === "IMAGE" && layer.assetId);
  const assetId = imageLayer?.assetId ?? first?.backgroundAssetId ?? null;
  if (!assetId) return null;
  const asset = campaign.assets.find((a) => a.id === assetId) ?? null;
  if (!asset) return null;
  if (asset.kind !== "image") return null;
  const mime = (asset.mime ?? "").toLowerCase();
  if (mime.includes("gif")) return null;
  if (asset.decodeStatus !== "ready") return null;
  if (!asset.publicUrl || !asset.publicUrl.startsWith("https://")) return null;
  return asset;
}

export function mapIntroCtaToProductAction(cta: IntroCta | null | undefined): {
  action: ProductIntroAction;
  label: string;
} {
  if (!cta?.enabled) return { action: { type: "none", target: "" }, label: "" };
  const dest = cta.destination;
  const label = (cta.label ?? dest.label ?? "").trim().slice(0, 40);
  switch (dest.type) {
    case "COMMUNITY":
      return { action: { type: "internal_surface", target: "community" }, label };
    case "TRADE":
      return { action: { type: "internal_surface", target: "trade" }, label };
    case "DELIVERY":
      return { action: { type: "internal_surface", target: "food" }, label };
    case "MESSENGER":
      return { action: { type: "internal_surface", target: "chat" }, label };
    case "MY_PAGE":
      return { action: { type: "internal_surface", target: "my" }, label };
    case "STORE":
      return { action: { type: "store", target: String(dest.id ?? "").trim() }, label };
    case "PRODUCT":
      return { action: { type: "product", target: String(dest.id ?? "").trim() }, label };
    case "LISTING":
      return { action: { type: "market_listing", target: String(dest.id ?? "").trim() }, label };
    case "POST":
    case "EVENT":
      return { action: { type: "community_post", target: String(dest.id ?? "").trim() }, label };
    case "CHAT_ROOM":
      return { action: { type: "chat_room", target: String(dest.id ?? "").trim() }, label };
    case "INTERNAL_PATH":
      return { action: { type: "internal_path", target: String(dest.path ?? "").trim() }, label };
    default:
      return { action: { type: "none", target: "" }, label };
  }
}

export function mapOperatorCampaignToProductIntro(
  campaign: IntroAdminCampaign,
  status: "active" | "inactive"
): ProductIntroConfig | { ok: false; error: string } {
  const asset = findOperatorImageAsset(campaign);
  if (status === "active" && !asset) return { ok: false, error: "image_required" };
  const extras = readOperatorSource(campaign.source);
  const scene = campaign.scenes[0];
  const duration = clampIntroHoldMs(scene?.durationMs ?? extras.displayDurationMs);
  const skipEnabled = (scene?.skipPolicy ?? "allow") !== "deny";
  const mappedCta = mapIntroCtaToProductAction(scene?.cta ?? null);
  const url = asset?.publicUrl ?? null;
  return {
    version: 1,
    status,
    name: campaign.name.slice(0, 120),
    campaignId: campaign.id,
    media: { mobileUrl: url, tabletUrl: null },
    mediaWidth: asset?.width ?? null,
    mediaHeight: asset?.height ?? null,
    displayMode: "fullscreen",
    objectFit: "contain",
    sizePreset: extras.sizePreset,
    customSizePercent: null,
    cornerRadiusPx: 0,
    backgroundColor: scene?.backgroundColor || PRODUCT_INTRO_BUNDLED_CANVAS_BACKGROUND,
    animationIn: "fade_in",
    animationOut: "expand_fade_out",
    enterDurationMs: 220,
    displayDurationMs: duration,
    exitDurationMs: 260,
    skipEnabled,
    showLogo: extras.showLogo,
    frequencyMode: campaign.frequencyMode,
    ctaLabel: mappedCta.label,
    action: mappedCta.action,
    startsAt: campaign.startsAt,
    endsAt: campaign.endsAt,
    updatedAt: new Date().toISOString(),
  };
}

export function deriveIntroOperatorAppState(input: {
  campaignId: string;
  status: IntroCampaignStatus;
  startsAt: string | null;
  endsAt: string | null;
  /** Ignored. Settings campaign identity is not device LOCAL_READY. */
  appliedCampaignId: string | null;
  /** Ignored. Settings status is not device application. */
  appliedStatus: string | null;
  nowMs?: number;
}): IntroOperatorAppState {
  void input.campaignId;
  void input.appliedCampaignId;
  void input.appliedStatus;
  const now = input.nowMs ?? Date.now();
  const starts = input.startsAt ? Date.parse(input.startsAt) : NaN;
  const ends = input.endsAt ? Date.parse(input.endsAt) : NaN;

  if (input.status === "archived" || input.status === "expired") return "ended";
  if (input.status === "paused") return "paused";
  if (input.status === "draft") return "draft";
  if (Number.isFinite(ends) && now >= ends) return "ended";
  if (input.status === "scheduled" || (Number.isFinite(starts) && now < starts)) {
    return "scheduled";
  }
  if (input.status === "active") return "published";
  return "draft";
}

export function buildOperatorScene(input: {
  existing?: IntroAdminScene | null;
  name: string;
  assetId: string | null;
  durationMs: number;
  skipEnabled: boolean;
  backgroundColor: string;
  cta: IntroCta | null;
}): IntroAdminScene {
  const duration = clampIntroHoldMs(input.durationMs);
  const layers: IntroLayer[] = input.assetId
    ? [
        {
          id: input.existing?.layers.find((l) => l.type === "IMAGE")?.id ?? "creative",
          type: "IMAGE",
          zIndex: 1,
          anchor: "center",
          name: "Intro",
          aspectPolicy: "contain",
          assetId: input.assetId,
        },
      ]
    : [];
  return {
    id: input.existing?.id ?? `tmp-${Date.now()}`,
    sortOrder: 0,
    name: input.name || "Intro",
    advanceMode: "timer",
    durationMs: duration,
    maxHoldMs: duration,
    transition: "fade",
    skipPolicy: input.skipEnabled ? "allow" : "deny",
    interactionMode: input.cta?.enabled ? "tap_cta" : "none",
    interactionLayerId: null,
    layers,
    cta: input.cta,
    backgroundColor: input.backgroundColor || PRODUCT_INTRO_BUNDLED_CANVAS_BACKGROUND,
    backgroundAssetId: null,
  };
}

export function isSupportedIntroImageMime(mime: string | null | undefined): boolean {
  const m = (mime ?? "").toLowerCase();
  return m === "image/jpeg" || m === "image/jpg" || m === "image/png" || m === "image/webp";
}

export function validateOperatorImageForPublish(campaign: IntroAdminCampaign): {
  ok: boolean;
  error?: string;
} {
  if (!campaign.name.trim()) return { ok: false, error: "name_required" };
  const asset = findOperatorImageAsset(campaign);
  if (!asset) return { ok: false, error: "image_required" };
  if (!isSupportedIntroImageMime(asset.mime)) return { ok: false, error: "image_mime_invalid" };
  const scene = campaign.scenes[0];
  if (!scene || scene.advanceMode !== "timer" || (scene.durationMs ?? 0) < INTRO_OPERATOR_HOLD_MS_MIN) {
    return { ok: false, error: "duration_required" };
  }
  if (scene.cta?.enabled) {
    const mapped = mapIntroCtaToProductAction(scene.cta);
    if (mapped.action.type === "none" || !mapped.action.target) {
      return { ok: false, error: "cta_destination_required" };
    }
    if (!PRODUCT_INTRO_ACTION_TYPES.includes(mapped.action.type)) {
      return { ok: false, error: "cta_destination_required" };
    }
  }
  return { ok: true };
}

export const INTRO_FREQUENCY_IDENTITY = "campaign_id" as const;

export type IntroFrequencyRecord = {
  lastShownAtMs: number | null;
  shownEver: boolean;
  shownThisSession: boolean;
};

export function isIntroFrequencyEligible(
  mode: IntroFrequencyMode,
  record: IntroFrequencyRecord,
  nowMs: number
): boolean {
  if (mode === "once_ever") return !record.shownEver;
  if (mode === "once_per_session") return !record.shownThisSession;
  if (mode === "once_per_day") {
    if (!record.lastShownAtMs) return true;
    const prev = new Date(record.lastShownAtMs);
    const now = new Date(nowMs);
    return (
      prev.getFullYear() !== now.getFullYear() ||
      prev.getMonth() !== now.getMonth() ||
      prev.getDate() !== now.getDate()
    );
  }
  return true;
}

export function resolveIntroDismissNavigation(input: {
  pendingDestination: string | null;
  ctaHref: string | null;
}): { href: string | null; reason: "pending" | "cta" | "original_destination" } {
  const pending = input.pendingDestination?.trim() || null;
  if (pending) return { href: pending, reason: "pending" };
  const cta = input.ctaHref?.trim() || null;
  if (cta) return { href: cta, reason: "cta" };
  return { href: null, reason: "original_destination" };
}
