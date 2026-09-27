/**
 * Intro V2 data-model contract (Phase 1).
 * Runtime authority is a published manifest, not draft rows.
 * Casing: DB stores lowercase status/mode enums; layer/CTA types stay uppercase.
 */

export const INTRO_V2_SCHEMA_VERSION = 2 as const;

export const INTRO_CAMPAIGN_STATUSES = [
  "draft",
  "scheduled",
  "active",
  "paused",
  "expired",
  "archived",
] as const;
export type IntroCampaignStatus = (typeof INTRO_CAMPAIGN_STATUSES)[number];

export const INTRO_STATUS_TS: Record<string, IntroCampaignStatus> = {
  DRAFT: "draft",
  SCHEDULED: "scheduled",
  ACTIVE: "active",
  PAUSED: "paused",
  EXPIRED: "expired",
  ARCHIVED: "archived",
};

export const INTRO_AUDIENCES = ["guest", "authenticated", "new", "returning"] as const;
export type IntroAudience = (typeof INTRO_AUDIENCES)[number];

export const INTRO_PLATFORMS = ["ios", "android", "web"] as const;
export type IntroPlatform = (typeof INTRO_PLATFORMS)[number];

export const INTRO_DEVICE_CLASSES = [
  "PHONE_ANDROID",
  "PHONE_IOS",
  "TABLET_ANDROID",
  "TABLET_IPAD",
  "DESKTOP_WINDOWS",
  "WEB_DESKTOP",
  "UNKNOWN",
] as const;
export type IntroDeviceClass = (typeof INTRO_DEVICE_CLASSES)[number];

export const INTRO_DEVICE_FAMILIES = ["PHONE", "TABLET", "DESKTOP"] as const;
export type IntroDeviceFamily = (typeof INTRO_DEVICE_FAMILIES)[number];

export const INTRO_FREQUENCY_MODES = [
  "every_launch",
  "once_ever",
  "once_per_day",
  "once_per_session",
] as const;
export type IntroFrequencyMode = (typeof INTRO_FREQUENCY_MODES)[number];

export const INTRO_DEEP_LINK_POLICIES = ["honor", "ignore", "defer"] as const;
export type IntroDeepLinkPolicy = (typeof INTRO_DEEP_LINK_POLICIES)[number];

export const INTRO_ADVANCE_MODES = ["timer", "media_end", "cta_only", "manual"] as const;
export type IntroAdvanceMode = (typeof INTRO_ADVANCE_MODES)[number];

export const INTRO_INTERACTION_MODES = ["none", "tap_advance", "tap_cta", "tap_layer"] as const;
export type IntroInteractionMode = (typeof INTRO_INTERACTION_MODES)[number];

export const INTRO_SKIP_POLICIES = ["allow", "deny"] as const;
export type IntroSkipPolicy = (typeof INTRO_SKIP_POLICIES)[number];

export const INTRO_TRANSITIONS = ["none", "fade", "fade_in_expand", "expand_fade_out"] as const;
export type IntroTransition = (typeof INTRO_TRANSITIONS)[number];

export const INTRO_LAYER_TYPES = [
  "BACKGROUND",
  "IMAGE",
  "LOGO",
  "TEXT",
  "CTA",
  "DECORATION",
] as const;
export type IntroLayerType = (typeof INTRO_LAYER_TYPES)[number];

export const INTRO_LAYER_ANCHORS = [
  "top_left",
  "top_center",
  "top_right",
  "center_left",
  "center",
  "center_right",
  "bottom_left",
  "bottom_center",
  "bottom_right",
] as const;
export type IntroLayerAnchor = (typeof INTRO_LAYER_ANCHORS)[number];

export const INTRO_ASPECT_POLICIES = ["contain", "cover", "fill", "none"] as const;
export type IntroAspectPolicy = (typeof INTRO_ASPECT_POLICIES)[number];

export const INTRO_CTA_DESTINATION_TYPES = [
  "COMMUNITY",
  "TRADE",
  "DELIVERY",
  "MESSENGER",
  "MY_PAGE",
  "STORE",
  "PRODUCT",
  "LISTING",
  "POST",
  "CHAT_ROOM",
  "EVENT",
  "INTERNAL_PATH",
  "EXTERNAL_URL",
] as const;
export type IntroCtaDestinationType = (typeof INTRO_CTA_DESTINATION_TYPES)[number];

export const INTRO_ASSET_KINDS = ["image", "gif", "video", "poster"] as const;
export type IntroAssetKind = (typeof INTRO_ASSET_KINDS)[number];

export const INTRO_DECODE_STATUSES = ["pending", "ready", "failed"] as const;
export type IntroDecodeStatus = (typeof INTRO_DECODE_STATUSES)[number];

export const INTRO_EXTERNAL_URL_HOST_ALLOWLIST = ["samarket.vercel.app", "dibay.app", "www.dibay.app"] as const;

export type IntroTargeting = {
  audiences: IntroAudience[];
  platforms: IntroPlatform[];
  deviceClasses: IntroDeviceClass[];
};

export const INTRO_TEXT_ALIGNS = ["left", "center", "right"] as const;
export type IntroTextAlign = (typeof INTRO_TEXT_ALIGNS)[number];

export const INTRO_FONT_TOKENS = ["title", "body", "caption"] as const;
export type IntroFontToken = (typeof INTRO_FONT_TOKENS)[number];

export const INTRO_DECORATION_KINDS = ["shape", "sticker", "divider"] as const;
export type IntroDecorationKind = (typeof INTRO_DECORATION_KINDS)[number];

export const INTRO_EASINGS = ["linear", "ease_in", "ease_out", "ease_in_out"] as const;
export type IntroEasing = (typeof INTRO_EASINGS)[number];

export const INTRO_ANIMATION_TYPES = ["none", "fade", "slide", "scale"] as const;
export type IntroAnimationType = (typeof INTRO_ANIMATION_TYPES)[number];

export const INTRO_ANIMATION_PHASES = ["enter", "emphasis", "exit"] as const;
export type IntroAnimationPhase = (typeof INTRO_ANIMATION_PHASES)[number];

export const INTRO_REPEAT_POLICIES = ["none", "once", "loop"] as const;
export type IntroRepeatPolicy = (typeof INTRO_REPEAT_POLICIES)[number];

export type IntroAnimationClip = {
  type: IntroAnimationType;
  durationMs: number;
  delayMs: number;
  easing: IntroEasing;
  repeat: IntroRepeatPolicy;
};

export type IntroAnimationMeta = {
  enter?: IntroAnimationClip;
  emphasis?: IntroAnimationClip;
  exit?: IntroAnimationClip;
};

export type IntroLayer = {
  id: string;
  type: IntroLayerType;
  zIndex: number;
  anchor: IntroLayerAnchor;
  name?: string;
  visible?: boolean;
  xPct?: number;
  yPct?: number;
  widthPct?: number;
  heightPct?: number;
  minWidthPct?: number;
  maxWidthPct?: number;
  opacity?: number;
  rotation?: number;
  safeArea?: boolean;
  aspectPolicy?: IntroAspectPolicy;
  assetId?: string;
  text?: string;
  fontToken?: IntroFontToken;
  fontSizePct?: number;
  fontWeight?: number;
  lineHeight?: number;
  textAlign?: IntroTextAlign;
  wrap?: boolean;
  maxLines?: number;
  color?: string;
  fillColor?: string;
  strokeColor?: string;
  strokeWidthPct?: number;
  cornerRadiusPct?: number;
  decorationKind?: IntroDecorationKind;
  animation?: string | IntroAnimationMeta;
};

export type IntroCtaDestination = {
  type: IntroCtaDestinationType;
  id?: string;
  path?: string;
  url?: string;
  /** Display cache only. Stable `id` remains authority. */
  label?: string;
};

export type IntroCta = {
  enabled: boolean;
  destination: IntroCtaDestination;
  label?: string;
  xPct?: number;
  yPct?: number;
  widthPct?: number;
  heightPct?: number;
  fontSizePct?: number;
  fontWeight?: number;
  cornerRadiusPct?: number;
  opacity?: number;
  align?: IntroTextAlign;
};

export type IntroResolverInput = {
  now: string;
  audience: IntroAudience | "unknown";
  platform: IntroPlatform | "unknown";
  deviceClass: IntroDeviceClass;
  frequencyEligible: boolean;
};

export type IntroResolverCandidate = {
  id: string;
  publicationId: string;
  revision: number;
  status: IntroCampaignStatus;
  startsAt: string | null;
  endsAt: string | null;
  priority: number;
  targeting: IntroTargeting;
};

export type ContractResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function isIn<T extends string>(set: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (set as readonly string[]).includes(value);
}
