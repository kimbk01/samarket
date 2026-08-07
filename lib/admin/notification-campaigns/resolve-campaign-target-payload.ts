/**
 * Create-contract for admin_notification_campaigns.target_payload.
 *
 * DB: jsonb NOT NULL DEFAULT '{}'::jsonb
 * UI: omits target_payload unless linking via app_notice_id
 * Downstream: optional appNoticeId only (null/{} both mean absent)
 *
 * DO NOT insert SQL null — it overrides the DB default and 500s.
 */

export type ResolveCampaignTargetPayloadInput = {
  app_notice_id?: unknown;
  target_payload?: unknown;
  /** When true, `target_payload: null` was present on the JSON body. */
  targetPayloadKeyPresent?: boolean;
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
 * - app_notice_id string → { appNoticeId } (existing create authority)
 */
export function resolveCampaignTargetPayload(
  input: ResolveCampaignTargetPayloadInput
): ResolveCampaignTargetPayloadResult {
  if (typeof input.app_notice_id === "string" && input.app_notice_id.trim()) {
    return { ok: true, target_payload: { appNoticeId: input.app_notice_id.trim() } };
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
