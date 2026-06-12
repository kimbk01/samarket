import type { SupabaseClient } from "@supabase/supabase-js";
import { RELEASE_ARCHIVE_SETTINGS_KEY } from "@/lib/release-archive/release-archive-keys";
import type { ReleaseArchiveBundleV1 } from "@/lib/release-archive/release-archive-state";
import { createDefaultReleaseArchiveBundle } from "@/lib/release-archive/release-archive-state";

function isMissingAdminSettings(err: { message?: string; code?: string }): boolean {
  const m = (err.message ?? "").toLowerCase();
  return err.code === "42P01" || (m.includes("relation") && m.includes("admin_settings"));
}

function parseBundle(raw: unknown): ReleaseArchiveBundleV1 | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (
    o.version !== 1 ||
    !Array.isArray(o.archives) ||
    !Array.isArray(o.archiveItems) ||
    !Array.isArray(o.regressionIssues) ||
    !Array.isArray(o.learningNotes)
  ) {
    return null;
  }
  return o as ReleaseArchiveBundleV1;
}

export async function loadReleaseArchiveBundleFromDb(
  sb: SupabaseClient
): Promise<
  | { ok: true; bundle: ReleaseArchiveBundleV1; source: "db" | "default" }
  | { ok: false; reason: "missing_table" | "error"; message?: string }
> {
  const { data, error } = await sb
    .from("admin_settings")
    .select("value_json")
    .eq("key", RELEASE_ARCHIVE_SETTINGS_KEY)
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
    return {
      ok: true,
      bundle: createDefaultReleaseArchiveBundle(),
      source: "default",
    };
  }
  return { ok: true, bundle: parsed, source: "db" };
}

export async function saveReleaseArchiveBundleToDb(
  sb: SupabaseClient,
  bundle: ReleaseArchiveBundleV1
): Promise<{ ok: true } | { ok: false; error: string }> {
  const value_json = { payload: bundle, updated_at: new Date().toISOString() };
  const { error } = await sb.from("admin_settings").upsert(
    {
      key: RELEASE_ARCHIVE_SETTINGS_KEY,
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
