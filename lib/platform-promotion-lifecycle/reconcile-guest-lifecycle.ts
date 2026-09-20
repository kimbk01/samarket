import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Guest → Member reconcile for promotion lifecycle.
 * Copies device-scoped rows for THIS deviceKey onto authenticated user.
 * Does NOT pull other devices/users. Does NOT write member state onto device.
 */
export async function reconcileGuestPromotionLifecycle(
  sb: SupabaseClient,
  input: { userId: string; anonymousDeviceKey: string }
): Promise<{ ok: true; suppressionsCopied: number; visitsCopied: number } | { ok: false; error: string }> {
  const userId = String(input.userId ?? "").trim();
  const deviceKey = String(input.anonymousDeviceKey ?? "").trim();
  if (!userId) return { ok: false, error: "missing_user_id" };
  if (!deviceKey) return { ok: false, error: "missing_device_key" };

  let suppressionsCopied = 0;
  let visitsCopied = 0;

  const { data: suppressRows, error: suppressReadErr } = await sb
    .from("platform_popup_user_suppressions")
    .select(
      "campaign_id, mode, session_key, suppress_until, campaign_revision, timezone"
    )
    .eq("anonymous_device_key", deviceKey)
    .is("user_id", null)
    .limit(200);

  if (suppressReadErr) {
    return { ok: false, error: suppressReadErr.message };
  }

  for (const row of suppressRows ?? []) {
    const campaignId = String((row as { campaign_id?: string }).campaign_id ?? "").trim();
    if (!campaignId) continue;
    const { error } = await sb.from("platform_popup_user_suppressions").insert({
      user_id: userId,
      anonymous_device_key: null,
      campaign_id: campaignId,
      mode: (row as { mode: string }).mode,
      session_key: (row as { session_key?: string | null }).session_key ?? null,
      suppress_until: (row as { suppress_until?: string | null }).suppress_until ?? null,
      campaign_revision: (row as { campaign_revision?: string | null }).campaign_revision ?? null,
      timezone: (row as { timezone?: string | null }).timezone ?? null,
    });
    if (!error) suppressionsCopied += 1;
  }

  const { data: visitRows, error: visitReadErr } = await sb
    .from("platform_promotion_content_visits")
    .select("event_id, source_channel, distribution_id, session_key, visited_at")
    .eq("anonymous_device_key", deviceKey)
    .is("user_id", null)
    .limit(200);

  if (visitReadErr) {
    return { ok: false, error: visitReadErr.message };
  }

  for (const row of visitRows ?? []) {
    const eventId = String((row as { event_id?: string }).event_id ?? "").trim();
    const sessionKey = String((row as { session_key?: string }).session_key ?? "").trim();
    if (!eventId || !sessionKey) continue;
    const { error } = await sb.from("platform_promotion_content_visits").insert({
      event_id: eventId,
      user_id: userId,
      anonymous_device_key: null,
      source_channel: (row as { source_channel: string }).source_channel,
      distribution_id: (row as { distribution_id?: string | null }).distribution_id ?? null,
      session_key: sessionKey,
      visited_at: (row as { visited_at?: string }).visited_at ?? undefined,
    });
    if (!error) visitsCopied += 1;
  }

  return { ok: true, suppressionsCopied, visitsCopied };
}
