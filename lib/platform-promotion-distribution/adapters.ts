import { buildPlatformEventDetailPath } from "@/lib/platform-events/types";
import {
  isEventBannerPlacementPresentationCompatible,
  normalizeEventBannerPresentation,
} from "@/lib/platform-promotion-distribution/banner-presentation";
import type {
  BannerDistributionConfig,
  BellDistributionConfig,
  PopupDistributionConfig,
  PromotionChannelRefType,
  PushDistributionConfig,
} from "@/lib/platform-promotion-distribution/types";

export type PopupAdapterPlan = {
  channelRefType: Extract<PromotionChannelRefType, "platform_popup_campaign">;
  ctaType: "event_detail";
  ctaTarget: string;
  href: string;
  surfaces: string[];
  presentationType: string;
  frequencyMode: string;
  startAt: string | null;
  endAt: string | null;
  name: string;
  /** When enabled=false, pause delivery without deleting history. */
  desiredCampaignStatus: "draft" | "active" | "paused";
};

export type BannerAdapterPlan = {
  channelRefType: Extract<PromotionChannelRefType, "feed_ad_campaign">;
  /** Owned promo path — never MEMBER_REQUESTED billing. */
  source: "ADMIN_DIRECT";
  presentation: "INLINE_BANNER" | "HERO_BANNER";
  /**
   * INLINE → materialize feed_ad_campaigns.
   * HERO → config-only in distribution SSOT; DeliveryAdBanner geometry at runtime (no paid Delivery write).
   */
  materializeFeedAd: boolean;
  placement: string;
  domain: "trade" | "community";
  destinationType: "internal_page";
  destinationUrl: string;
  imageUrl: string;
  headline: string;
  startAt: string | null;
  endAt: string | null;
  name: string;
  desiredCampaignStatus: "draft" | "active" | "paused";
};

export type NotificationAdapterPlan = {
  channelRefType: Extract<PromotionChannelRefType, "admin_notification_campaign">;
  campaignChannel: "push_only" | "in_app_only";
  title: string;
  body: string;
  imageUrl: string | null;
  deeplinkUrl: string;
  targetType: string;
  saveAsDraft: true;
  /** Configuration save never dispatches. */
  dispatchOnSave: false;
};

export type AdapterResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function planPopupDistributionAdapter(input: {
  eventId: string;
  eventTitle: string;
  enabled: boolean;
  config?: PopupDistributionConfig;
}): AdapterResult<PopupAdapterPlan> {
  const eventId = String(input.eventId ?? "").trim();
  if (!eventId) return { ok: false, error: "event_id_required" };
  const href = buildPlatformEventDetailPath(eventId);
  const cfg = input.config ?? {};
  const surfaces =
    Array.isArray(cfg.surfaces) && cfg.surfaces.length > 0
      ? cfg.surfaces.map((s) => String(s).trim().toUpperCase())
      : ["GLOBAL"];
  return {
    ok: true,
    value: {
      channelRefType: "platform_popup_campaign",
      ctaType: "event_detail",
      ctaTarget: eventId,
      href,
      surfaces,
      presentationType: cfg.presentationType?.trim() || "center_modal",
      frequencyMode: cfg.frequencyMode?.trim() || "once_per_session",
      startAt: cfg.startAt ?? null,
      endAt: cfg.endAt ?? null,
      name: cfg.name?.trim() || `Event · ${input.eventTitle}`.slice(0, 120),
      desiredCampaignStatus: input.enabled ? "active" : "paused",
    },
  };
}

export function planBannerDistributionAdapter(input: {
  eventId: string;
  eventTitle: string;
  enabled: boolean;
  config?: BannerDistributionConfig;
}): AdapterResult<BannerAdapterPlan> {
  const eventId = String(input.eventId ?? "").trim();
  if (!eventId) return { ok: false, error: "event_id_required" };
  const cfg = input.config ?? {};
  const presentation = normalizeEventBannerPresentation(cfg.presentation);
  const placement = String(cfg.placement ?? "TRADE_HOME").trim().toUpperCase();
  if (!isEventBannerPlacementPresentationCompatible(placement, presentation)) {
    return {
      ok: false,
      error: `placement_presentation_incompatible:${placement}+${presentation}`,
    };
  }
  const domain: "trade" | "community" =
    cfg.domain === "community" || placement.startsWith("COMMUNITY")
      ? "community"
      : "trade";
  return {
    ok: true,
    value: {
      channelRefType: "feed_ad_campaign",
      source: "ADMIN_DIRECT",
      presentation,
      materializeFeedAd: presentation === "INLINE_BANNER",
      placement,
      domain,
      destinationType: "internal_page",
      destinationUrl: buildPlatformEventDetailPath(eventId),
      imageUrl: String(cfg.imageUrl ?? "").trim(),
      headline: cfg.headline?.trim() || input.eventTitle,
      startAt: cfg.startAt ?? null,
      endAt: cfg.endAt ?? null,
      name: cfg.name?.trim() || `Event banner · ${input.eventTitle}`.slice(0, 120),
      desiredCampaignStatus: input.enabled ? "active" : "paused",
    },
  };
}

export function planPushDistributionAdapter(input: {
  eventId: string;
  eventTitle: string;
  enabled: boolean;
  config?: PushDistributionConfig;
}): AdapterResult<NotificationAdapterPlan> {
  const eventId = String(input.eventId ?? "").trim();
  if (!eventId) return { ok: false, error: "event_id_required" };
  if (!input.enabled) {
    return {
      ok: true,
      value: {
        channelRefType: "admin_notification_campaign",
        campaignChannel: "push_only",
        title: "",
        body: "",
        imageUrl: null,
        deeplinkUrl: buildPlatformEventDetailPath(eventId),
        targetType: "marketing_opt_in",
        saveAsDraft: true,
        dispatchOnSave: false,
      },
    };
  }
  const cfg = input.config ?? {};
  const title = String(cfg.title ?? input.eventTitle).trim();
  const body = String(cfg.body ?? "").trim();
  if (!title) return { ok: false, error: "push_title_required" };
  if (!body) return { ok: false, error: "push_body_required" };
  return {
    ok: true,
    value: {
      channelRefType: "admin_notification_campaign",
      campaignChannel: "push_only",
      title,
      body,
      imageUrl: cfg.imageUrl?.trim() || null,
      deeplinkUrl: buildPlatformEventDetailPath(eventId),
      targetType: cfg.targetType?.trim() || "marketing_opt_in",
      saveAsDraft: true,
      dispatchOnSave: false,
    },
  };
}

export function planBellDistributionAdapter(input: {
  eventId: string;
  eventTitle: string;
  enabled: boolean;
  config?: BellDistributionConfig;
}): AdapterResult<NotificationAdapterPlan> {
  const eventId = String(input.eventId ?? "").trim();
  if (!eventId) return { ok: false, error: "event_id_required" };
  if (!input.enabled) {
    return {
      ok: true,
      value: {
        channelRefType: "admin_notification_campaign",
        campaignChannel: "in_app_only",
        title: "",
        body: "",
        imageUrl: null,
        deeplinkUrl: buildPlatformEventDetailPath(eventId),
        targetType: "all",
        saveAsDraft: true,
        dispatchOnSave: false,
      },
    };
  }
  const cfg = input.config ?? {};
  const title = String(cfg.title ?? input.eventTitle).trim();
  const body = String(cfg.body ?? "").trim();
  if (!title) return { ok: false, error: "bell_title_required" };
  if (!body) return { ok: false, error: "bell_body_required" };
  return {
    ok: true,
    value: {
      channelRefType: "admin_notification_campaign",
      campaignChannel: "in_app_only",
      title,
      body,
      imageUrl: cfg.imageUrl?.trim() || null,
      deeplinkUrl: buildPlatformEventDetailPath(eventId),
      targetType: cfg.targetType?.trim() || "all",
      saveAsDraft: true,
      dispatchOnSave: false,
    },
  };
}
