import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Load Event ids visited this app session for the current actor.
 * Bounded lookup — session_key + actor only (no full history scan).
 */
export async function loadSessionCoordinatedEventIds(
  sb: SupabaseClient,
  input: {
    sessionKey: string | null | undefined;
    userId?: string | null;
    anonymousDeviceKey?: string | null;
  }
): Promise<Set<string>> {
  const out = new Set<string>();
  const sessionKey = String(input.sessionKey ?? "").trim();
  if (!sessionKey) return out;

  const userId = String(input.userId ?? "").trim() || null;
  const deviceKey = String(input.anonymousDeviceKey ?? "").trim() || null;
  if (!userId && !deviceKey) return out;

  let q = sb
    .from("platform_promotion_content_visits")
    .select("event_id")
    .eq("session_key", sessionKey)
    .limit(100);

  if (userId) {
    q = q.eq("user_id", userId);
  } else {
    q = q.eq("anonymous_device_key", deviceKey!);
  }

  const { data, error } = await q;
  if (error) {
    console.error("[promotion-lifecycle] content_visit_load_failed", error.message);
    return out;
  }
  for (const row of data ?? []) {
    const id = String((row as { event_id?: string }).event_id ?? "").trim();
    if (id) out.add(id);
  }
  return out;
}
