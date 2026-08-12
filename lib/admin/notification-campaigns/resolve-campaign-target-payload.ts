/**
 * Create-contract for admin_notification_campaigns.target_payload.
 *
 * DB: jsonb NOT NULL DEFAULT '{}'::jsonb
 * UI: omits target_payload unless linking via app_notice_id
 * Downstream: appNoticeId + content bind fields when linked
 *
 * DO NOT insert SQL null — it overrides the DB default and 500s.
 */

import { resolveCustomerCenterCampaignContentBind } from "@/lib/notices/customer-center-campaign-bind";

export type ResolveCampaignTargetPayloadInput = {
  app_notice_id?: unknown;
  target_payload?: unknown;
  /** When true, `target_payload: null` was present on the JSON body. */
  targetPayloadKeyPresent?: boolean;
  /** Campaign type → content_type for board deeplink. */
  campaign_type?: unknown;
};

export type ResolveCampaignTargetPayloadResult =
  | { ok: true; target_payload: Record<string, unknown> }
  | { ok: false; error: "invalid_target_payload" };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Resolve insert value for target_payload.
 * - omitted → {}
 * - plain object → preserved
 * - explicit null → reject (no silent normalize)
 * - app_notice_id string → content bind payload
 */
export function resolveCampaignTargetPayload(
  input: ResolveCampaignTargetPayloadInput
): ResolveCampaignTargetPayloadResult {
  if (typeof input.app_notice_id === "string" && input.app_notice_id.trim()) {
    const contentId = input.app_notice_id.trim();
    const contentType =
      input.campaign_type === "system" || input.campaign_type === "marketing"
        ? input.campaign_type
        : "notice";
    const bind = resolveCustomerCenterCampaignContentBind({
      contentId,
      contentType,
    });
    return {
      ok: true,
      target_payload: {
        appNoticeId: contentId,
        content_id: contentId,
        content_type: bind?.content_type ?? contentType,
        canonical_route: bind?.canonical_route ?? null,
      },
    };
  }

  if (input.targetPayloadKeyPresent === true && input.target_payload === null) {
    return { ok: false, error: "invalid_target_payload" };
  }

  if (input.target_payload === undefined) {
    return { ok: true, target_payload: {} };
  }

  if (isPlainObject(input.target_payload)) {
    return { ok: true, target_payload: input.target_payload };
  }

  return { ok: false, error: "invalid_target_payload" };
}
