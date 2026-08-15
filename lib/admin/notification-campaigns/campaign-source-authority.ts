/**
 * Customer Communication Campaign Source Authority (SSOT).
 *
 * Campaign = DELIVERY ONLY.
 * Official notice / system bulletin require app_notices content bind.
 * Marketing requires content bind OR approved internal landing.
 * CASE C (title/body-only official campaign) is WRITE-FORBIDDEN.
 *
 * Legacy unbound rows remain READ-COMPATIBLE for members.
 */

import { resolveSafeNotificationInternalRoute } from "@/lib/notifications/policy/notification-internal-route";
import { isBareNotificationsCenterHref } from "@/lib/notifications/resolve-notification-inbox-href";
import { resolveCustomerCenterCampaignContentBind } from "@/lib/notices/customer-center-campaign-bind";
import { isCustomerCenterContentType } from "@/lib/notices/customer-center-content";

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
  | "invalid_content_bind";

export type CampaignSourceAuthorityOk = {
  ok: true;
  mode: "content_bound" | "approved_landing";
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

/**
 * Approved marketing landing: safe internal route that is not bare /notifications
 * and not used as a substitute for missing content (must be a real destination).
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

  // marketing — landing allowed
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
  return true;
}
