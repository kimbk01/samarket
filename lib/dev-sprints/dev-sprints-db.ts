import type { SupabaseClient } from "@supabase/supabase-js";
import { DEV_SPRINTS_SETTINGS_KEY } from "@/lib/dev-sprints/dev-sprints-keys";
import type { DevSprintsBundleV1 } from "@/lib/dev-sprints/dev-sprints-state";
import { createDefaultDevSprintsBundle } from "@/lib/dev-sprints/dev-sprints-state";

function isMissingAdminSettings(err: { message?: string; code?: string }): boolean {
  const m = (err.message ?? "").toLowerCase();
  return err.code === "42P01" || (m.includes("relation") && m.includes("admin_settings"));
}

function parseBundle(raw: unknown): DevSprintsBundleV1 | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (
    o.version !== 1 ||
    !Array.isArray(o.sprints) ||
    !Array.isArray(o.sprintItems) ||
    !Array.isArray(o.releaseNotes) ||
    !Array.isArray(o.releaseNoteItems) ||
    !Array.isArray(o.postReleaseChecks)
  ) {
    return null;
  }
  return o as DevSprintsBundleV1;
}

export async function loadDevSprintsBundleFromDb(
  sb: SupabaseClient
): Promise<
  | { ok: true; bundle: DevSprintsBundleV1; source: "db" | "default" }
  | { ok: false; reason: "missing_table" | "error"; message?: string }
> {
  const { data, error } = await sb
    .from("admin_settings")
    .select("value_json")
    .eq("key", DEV_SPRINTS_SETTINGS_KEY)
    .maybeSingle();

  if (error) {
    if (isMissingAdminSettings(error)) {
      return { ok: false, reason: "missing_table", message: error.message };
    }
    return { ok: false, reason: "error", message: error.message };
  }

  const v = (data as { value_json?: unknown } | null)?.value_json;
  const inner =
    v && typeof v === "object" && "payload" in (v as object)
      ? (v as { payload?: unknown }).payload
      : v;
  const parsed = parseBundle(inner);
  if (!parsed) {
    return { ok: true, bundle: createDefaultDevSprintsBundle(), source: "default" };
  }
  return { ok: true, bundle: parsed, source: "db" };
}

export async function saveDevSprintsBundleToDb(
  sb: SupabaseClient,
  bundle: DevSprintsBundleV1
): Promise<{ ok: true } | { ok: false; error: string }> {
  const value_json = { payload: bundle, updated_at: new Date().toISOString() };
  const { error } = await sb.from("admin_settings").upsert(
    {
      key: DEV_SPRINTS_SETTINGS_KEY,
      value_json,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );
  if (error) {
    if (isMissingAdminSettings(error)) {
      return { ok: false, error: "admin_settings 테이블이 없습니다." };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
