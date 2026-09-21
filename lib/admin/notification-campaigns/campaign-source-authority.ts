/**
 * Customer Communication Campaign Source Authority (SSOT).
 *
 * Campaign = DELIVERY ONLY.
 * Official notice / system bulletin require app_notices content bind.
 * Marketing requires content bind OR approved internal landing OR
 * published Platform Event source identity (not a path-prefix bypass).
 * CASE C (title/body-only official campaign) is WRITE-FORBIDDEN.
 *
 * SOURCE (content / Event identity) ≠ DESTINATION (click landing).
 * Legacy unbound rows remain READ-COMPATIBLE for members.
 */

import {
  isAllowedPlatformEventNotificationPath,
  resolveSafeNotificationInternalRoute,
} from "@/lib/notifications/policy/notification-internal-route";
import { isBareNotificationsCenterHref } from "@/lib/notifications/resolve-notification-inbox-href";
import { resolveCustomerCenterCampaignContentBind } from "@/lib/notices/customer-center-campaign-bind";
import { isCustomerCenterContentType } from "@/lib/notices/customer-center-content";
import { extractEventIdFromHref } from "@/lib/platform-promotion-lifecycle/content-visit-contract";
import {
  isPlatformEventPubliclyAvailable,
  resolvePlatformEventAvailability,
  type PlatformEventPublicationInput,
} from "@/lib/platform-events/publication";
import { buildPlatformEventDetailPath } from "@/lib/platform-events/types";

export type OfficialCampaignType = "notice" | "system" | "marketing";

export type CampaignSourceAuthorityInput = {
  campaign_type: OfficialCampaignType | string;
  app_notice_id?: unknown;
  content_id?: unknown;
  content_type?: unknown;
  deeplink_url?: unknown;
  web_url?: unknown;
  target_url?: unknown;
  target_payload?: unknown;
};

export type CampaignSourceAuthorityError =
  | "notice_content_required"
  | "system_bulletin_content_required"
  | "marketing_source_required"
  | "invalid_campaign_type"
  | "invalid_content_bind"
  | "event_source_missing"
  | "event_source_unpublished"
  | "event_source_unavailable";

export type CampaignSourceAuthorityOk = {
  ok: true;
  mode: "content_bound" | "approved_landing" | "platform_event";
  content_id: string | null;
  content_type: "notice" | "system" | "marketing" | null;
  canonical_route: string | null;
  approved_landing: string | null;
  target_payload: Record<string, unknown>;
};

export type CampaignSourceAuthorityResult =
  | CampaignSourceAuthorityOk
  | { ok: false; error: CampaignSourceAuthorityError };

function trimStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function contentIdFromInput(input: CampaignSourceAuthorityInput): string {
  const direct = trimStr(input.app_notice_id) || trimStr(input.content_id);
  if (direct) return direct;
  const tp = input.target_payload;
  if (tp && typeof tp === "object" && !Array.isArray(tp)) {
    const o = tp as Record<string, unknown>;
    return trimStr(o.appNoticeId) || trimStr(o.content_id) || trimStr(o.app_notice_id);
  }
  return "";
}

function payloadObject(input: CampaignSourceAuthorityInput): Record<string, unknown> | null {
  const tp = input.target_payload;
  if (tp && typeof tp === "object" && !Array.isArray(tp)) {
    return tp as Record<string, unknown>;
  }
  return null;
}

function platformEventIdFromPayload(input: CampaignSourceAuthorityInput): string {
  const o = payloadObject(input);
  if (!o) return "";
  return trimStr(o.platform_event_id) || trimStr(o.event_id);
}

function eventIdFromDestinationUrls(input: CampaignSourceAuthorityInput): string {
  for (const candidate of [input.deeplink_url, input.web_url, input.target_url]) {
    const id = extractEventIdFromHref(typeof candidate === "string" ? candidate : "");
    if (id) return id;
  }
  return "";
}

function isUnsafeEventId(id: string): boolean {
  return !id || id.includes("..") || id.includes("/") || id.includes("\\");
}

/**
 * Event-originated marketing SOURCE — identity + canonical destination.
 * Path-only `/events/…` without `platform_event_id` is not a source.
 */
export function resolvePlatformEventCampaignSource(
  input: CampaignSourceAuthorityInput
): CampaignSourceAuthorityResult | null {
  const payloadId = platformEventIdFromPayload(input);
  const pathId = eventIdFromDestinationUrls(input);
  if (!payloadId && !pathId) return null;
  if (isUnsafeEventId(payloadId || pathId)) {
    return { ok: false, error: "marketing_source_required" };
  }
  if (!payloadId || !pathId || payloadId !== pathId) {
    return { ok: false, error: "marketing_source_required" };
  }
  const canonical = buildPlatformEventDetailPath(payloadId);
  if (extractEventIdFromHref(canonical) !== payloadId) {
    return { ok: false, error: "marketing_source_required" };
  }
  return {
    ok: true,
    mode: "platform_event",
    content_id: payloadId,
    content_type: null,
    canonical_route: canonical,
    approved_landing: canonical,
    target_payload: {
      platform_event_id: payloadId,
      canonical_route: canonical,
    },
  };
}

function safeRoutePathname(safe: string): string {
  try {
    return new URL(safe, "https://dibay.internal").pathname;
  } catch {
    const q = safe.indexOf("?");
    const h = safe.indexOf("#");
    const end = q >= 0 && h >= 0 ? Math.min(q, h) : q >= 0 ? q : h >= 0 ? h : safe.length;
    return safe.slice(0, end);
  }
}

/**
 * Approved marketing landing: safe internal route that is not bare /notifications
 * and not used as a substitute for missing content (must be a real destination).
 *
 * Platform Event Detail is DESTINATION-safe via the identity path registry, but
 * is NOT a generic M2 landing. Event campaigns must bind `platform_event_id`.
 */
export function resolveApprovedMarketingLandingRoute(
  deeplinkUrl?: unknown,
  webUrl?: unknown,
  targetUrl?: unknown
): string | null {
  for (const candidate of [deeplinkUrl, webUrl, targetUrl]) {
    const safe = resolveSafeNotificationInternalRoute(candidate, null);
    if (!safe) continue;
    if (isBareNotificationsCenterHref(safe)) continue;
    if (safe === "/notifications" || safe.startsWith("/notifications?")) continue;
    // Customer-center board paths without content id are list hubs — not marketing landing.
    if (
      safe === "/mypage/customer-center/notice" ||
      safe === "/mypage/customer-center/system" ||
      safe === "/mypage/customer-center/marketing" ||
      safe === "/mypage/customer-center"
    ) {
      continue;
    }
    if (isAllowedPlatformEventNotificationPath(safeRoutePathname(safe))) {
      continue;
    }
    return safe;
  }
  return null;
}

function hasContentBindInPayload(payload: Record<string, unknown> | null | undefined): boolean {
  if (!payload) return false;
  return Boolean(trimStr(payload.appNoticeId) || trimStr(payload.content_id));
}

/**
 * Validate official campaign source for CREATE (and optionally SEND).
 * Does not mutate legacy rows — only gates new writes.
 */
export function validateOfficialCampaignSource(
  input: CampaignSourceAuthorityInput
): CampaignSourceAuthorityResult {
  const typ = trimStr(input.campaign_type).toLowerCase();
  if (typ !== "notice" && typ !== "system" && typ !== "marketing") {
    return { ok: false, error: "invalid_campaign_type" };
  }

  const contentId = contentIdFromInput(input);
  if (contentId) {
    const contentTypeRaw =
      trimStr(input.content_type) ||
      (input.target_payload &&
      typeof input.target_payload === "object" &&
      !Array.isArray(input.target_payload)
        ? trimStr((input.target_payload as Record<string, unknown>).content_type)
        : "") ||
      typ;
    if (!isCustomerCenterContentType(contentTypeRaw)) {
      return { ok: false, error: "invalid_content_bind" };
    }
    // Bulletin type must match campaign type for notice/system; marketing content_type=marketing.
    if (typ === "notice" && contentTypeRaw !== "notice") {
      return { ok: false, error: "invalid_content_bind" };
    }
    if (typ === "system" && contentTypeRaw !== "system") {
      return { ok: false, error: "invalid_content_bind" };
    }
    if (typ === "marketing" && contentTypeRaw !== "marketing") {
      return { ok: false, error: "invalid_content_bind" };
    }
    const bind = resolveCustomerCenterCampaignContentBind({
      contentId,
      contentType: contentTypeRaw,
    });
    if (!bind) {
      return { ok: false, error: "invalid_content_bind" };
    }
    return {
      ok: true,
      mode: "content_bound",
      content_id: bind.content_id,
      content_type: bind.content_type,
      canonical_route: bind.canonical_route,
      approved_landing: null,
      target_payload: {
        appNoticeId: bind.content_id,
        content_id: bind.content_id,
        content_type: bind.content_type,
        canonical_route: bind.canonical_route,
      },
    };
  }

  if (typ === "notice") {
    return { ok: false, error: "notice_content_required" };
  }
  if (typ === "system") {
    return { ok: false, error: "system_bulletin_content_required" };
  }

  // marketing — Event source identity (not a /events prefix landing)
  const eventSource = resolvePlatformEventCampaignSource(input);
  if (eventSource) return eventSource;

  // marketing — generic approved internal landing
  const landing = resolveApprovedMarketingLandingRoute(
    input.deeplink_url,
    input.web_url,
    input.target_url
  );
  if (landing) {
    return {
      ok: true,
      mode: "approved_landing",
      content_id: null,
      content_type: null,
      canonical_route: null,
      approved_landing: landing,
      target_payload: {},
    };
  }

  return { ok: false, error: "marketing_source_required" };
}

/** True when an existing campaign row may be sent under the hard lock. */
export function campaignRowHasOfficialSource(row: {
  type?: string | null;
  target_payload?: unknown;
  deeplink_url?: string | null;
  web_url?: string | null;
  target_url?: string | null;
}): boolean {
  const typ = trimStr(row.type).toLowerCase();
  if (typ !== "notice" && typ !== "system" && typ !== "marketing") return true;
  const result = validateOfficialCampaignSource({
    campaign_type: typ,
    target_payload: row.target_payload,
    deeplink_url: row.deeplink_url,
    web_url: row.web_url,
    target_url: row.target_url,
  });
  return result.ok;
}

export function isLegacyUnboundOfficialCampaign(row: {
  type?: string | null;
  target_payload?: unknown;
  deeplink_url?: string | null;
  web_url?: string | null;
  target_url?: string | null;
}): boolean {
  const typ = trimStr(row.type).toLowerCase();
  if (typ !== "notice" && typ !== "system" && typ !== "marketing") return false;
  const tp =
    row.target_payload && typeof row.target_payload === "object" && !Array.isArray(row.target_payload)
      ? (row.target_payload as Record<string, unknown>)
      : null;
  if (hasContentBindInPayload(tp)) return false;
  if (typ === "marketing" && resolveApprovedMarketingLandingRoute(row.deeplink_url, row.web_url, row.target_url)) {
    return false;
  }
  if (
    typ === "marketing" &&
    resolvePlatformEventCampaignSource({
      campaign_type: typ,
      target_payload: row.target_payload,
      deeplink_url: row.deeplink_url,
      web_url: row.web_url,
      target_url: row.target_url,
    })?.ok
  ) {
    return false;
  }
  return true;
}

export type PlatformEventSendLookup = (
  eventId: string
) => Promise<PlatformEventPublicationInput | null>;

/**
 * SEND/test-send eligibility — same SSOT as create, plus live Event publication
 * when the campaign is Event-sourced. Does not dispatch.
 */
export async function evaluateOfficialCampaignSendEligibility(
  row: {
    type?: string | null;
    target_payload?: unknown;
    deeplink_url?: string | null;
    web_url?: string | null;
    target_url?: string | null;
  },
  lookupEvent: PlatformEventSendLookup
): Promise<CampaignSourceAuthorityResult> {
  const typ = trimStr(row.type).toLowerCase();
  const structural = validateOfficialCampaignSource({
    campaign_type: typ,
    target_payload: row.target_payload,
    deeplink_url: row.deeplink_url,
    web_url: row.web_url,
    target_url: row.target_url,
  });
  if (!structural.ok) return structural;
  if (structural.mode !== "platform_event") return structural;
  const eventId = trimStr(structural.content_id);
  if (!eventId) return { ok: false, error: "event_source_missing" };
  const event = await lookupEvent(eventId);
  if (!event) return { ok: false, error: "event_source_missing" };
  const availability = resolvePlatformEventAvailability(event);
  if (availability === "missing") return { ok: false, error: "event_source_missing" };
  if (availability === "draft" || availability === "unpublished") {
    return { ok: false, error: "event_source_unpublished" };
  }
  if (!isPlatformEventPubliclyAvailable(event)) {
    return { ok: false, error: "event_source_unavailable" };
  }
  return structural;
}
