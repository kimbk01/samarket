/**
 * Server lock shared by every destructive data-reset path.
 *
 * A destructive mutation is allowed only while a reset window is OPEN in the database
 * (public.data_reset_windows — requested by one Super Admin, opened by a different one, expires
 * automatically). The window lives in Postgres, not in the UI, so a direct API call cannot skip it.
 * Missing migration / RPC error → closed (fail-closed).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type DataResetWindowRow = {
  id: string | null;
  status: "requested" | "open" | "closed" | "rejected" | "expired" | null;
  reason: string | null;
  requested_by: string | null;
  requested_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  open_until: string | null;
  closed_at: string | null;
  close_reason: string | null;
  database_target: string | null;
};

export async function readCurrentDataResetWindow(
  sb: SupabaseClient
): Promise<{ ok: true; window: DataResetWindowRow | null } | { ok: false; reason: string }> {
  const { data, error } = await sb.rpc("data_reset_window_current");
  if (error) return { ok: false, reason: "reset_window_unavailable" };
  const row = (Array.isArray(data) ? data[0] : data) as DataResetWindowRow | null;
  if (!row || !row.id) return { ok: true, window: null };
  return { ok: true, window: row };
}

export async function requireOpenDataResetWindow(
  sb: SupabaseClient
): Promise<{ ok: true; windowId: string } | { ok: false; reason: string }> {
  const cur = await readCurrentDataResetWindow(sb);
  if (!cur.ok) return cur;
  if (!cur.window || cur.window.status !== "open" || !cur.window.id) {
    return { ok: false, reason: "reset_window_not_open" };
  }
  return { ok: true, windowId: cur.window.id };
}
