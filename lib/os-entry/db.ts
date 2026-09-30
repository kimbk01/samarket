import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createBuiltInOsEntryConfig,
  OS_ENTRY_STORAGE_BUCKET,
} from "@/lib/os-entry/defaults";
import {
  isOsEntryBundleComplete,
  normalizeOsEntryConfig,
  osEntryConfigToDbRow,
} from "@/lib/os-entry/normalize";
import type { OsEntryAdminSnapshot, OsEntryConfig, OsEntryLane } from "@/lib/os-entry/types";

function isMissingTable(err: { message?: string; code?: string }): boolean {
  const m = (err.message ?? "").toLowerCase();
  return (
    err.code === "42P01" ||
    (m.includes("relation") && m.includes("os_entry_screen_config"))
  );
}

function rowToConfig(row: Record<string, unknown> | null, fallbackRev = 0): OsEntryConfig {
  if (!row) {
    const built = createBuiltInOsEntryConfig(new Date().toISOString());
    return { ...built, revision: fallbackRev };
  }
  return normalizeOsEntryConfig(row);
}

export async function loadOsEntryLane(
  sb: SupabaseClient,
  lane: OsEntryLane
): Promise<
  | { ok: true; config: OsEntryConfig; found: boolean }
  | { ok: false; reason: "missing_table" | "error"; message?: string }
> {
  const { data, error } = await sb
    .from("os_entry_screen_config")
    .select("*")
    .eq("lane", lane)
    .maybeSingle();

  if (error) {
    if (isMissingTable(error)) {
      return { ok: false, reason: "missing_table", message: error.message };
    }
    return { ok: false, reason: "error", message: error.message };
  }
  return {
    ok: true,
    config: rowToConfig((data as Record<string, unknown> | null) ?? null),
    found: data != null,
  };
}

export async function loadOsEntryAdminSnapshot(
  sb: SupabaseClient
): Promise<
  | { ok: true; snapshot: OsEntryAdminSnapshot }
  | { ok: false; reason: "missing_table" | "error"; message?: string }
> {
  const draft = await loadOsEntryLane(sb, "draft");
  if (!draft.ok) return draft;
  const live = await loadOsEntryLane(sb, "live");
  if (!live.ok) return live;
  return {
    ok: true,
    snapshot: {
      draft: draft.found
        ? draft.config
        : createBuiltInOsEntryConfig(new Date().toISOString()),
      live: live.found
        ? live.config
        : { ...createBuiltInOsEntryConfig(new Date().toISOString()), revision: 0 },
    },
  };
}

export async function saveOsEntryDraft(
  sb: SupabaseClient,
  config: OsEntryConfig,
  updatedBy: string | null
): Promise<{ ok: true; config: OsEntryConfig } | { ok: false; error: string }> {
  const live = await loadOsEntryLane(sb, "live");
  if (!live.ok) {
    return { ok: false, error: live.message ?? live.reason };
  }
  const next = normalizeOsEntryConfig({
    ...config,
    // Draft keeps working revision display as live revision (apply bumps live).
    revision: live.config.revision,
    updatedAt: new Date().toISOString(),
  });
  const row = {
    ...osEntryConfigToDbRow(next, "draft"),
    updated_by: updatedBy,
  };
  const { error } = await sb.from("os_entry_screen_config").upsert(row, { onConflict: "lane" });
  if (error) {
    if (isMissingTable(error)) return { ok: false, error: "os_entry_screen_config missing" };
    return { ok: false, error: error.message };
  }
  return { ok: true, config: next };
}

export async function applyOsEntryDraftToLive(
  sb: SupabaseClient,
  updatedBy: string | null
): Promise<{ ok: true; live: OsEntryConfig } | { ok: false; error: string }> {
  const draft = await loadOsEntryLane(sb, "draft");
  if (!draft.ok) return { ok: false, error: draft.message ?? draft.reason };
  if (!draft.found) return { ok: false, error: "draft_missing" };
  if (!isOsEntryBundleComplete(draft.config)) {
    return { ok: false, error: "incomplete_bundle" };
  }

  const live = await loadOsEntryLane(sb, "live");
  if (!live.ok) return { ok: false, error: live.message ?? live.reason };

  const nextRevision = Math.max(1, (live.found ? live.config.revision : 0) + 1);
  let imageStoragePath = draft.config.imageStoragePath;
  let imageUrl = draft.config.imageUrl;

  // Copy draft remote image into live/{revision}/ so LIVE is immutable per revision.
  if (imageStoragePath && imageStoragePath.startsWith("draft/")) {
    const ext = imageStoragePath.includes(".")
      ? imageStoragePath.slice(imageStoragePath.lastIndexOf("."))
      : ".bin";
    const livePath = `live/${nextRevision}/image${ext}`;
    const { error: copyError } = await sb.storage
      .from(OS_ENTRY_STORAGE_BUCKET)
      .copy(imageStoragePath, livePath);
    if (copyError) {
      return { ok: false, error: `image_copy_failed:${copyError.message}` };
    }
    const {
      data: { publicUrl },
    } = sb.storage.from(OS_ENTRY_STORAGE_BUCKET).getPublicUrl(livePath);
    imageStoragePath = livePath;
    imageUrl = publicUrl;
  }

  const nextLive = normalizeOsEntryConfig({
    ...draft.config,
    imageStoragePath,
    imageUrl,
    revision: nextRevision,
    updatedAt: new Date().toISOString(),
  });

  if (!isOsEntryBundleComplete(nextLive)) {
    return { ok: false, error: "incomplete_bundle" };
  }

  const { error } = await sb.from("os_entry_screen_config").upsert(
    {
      ...osEntryConfigToDbRow(nextLive, "live"),
      updated_by: updatedBy,
    },
    { onConflict: "lane" }
  );
  if (error) {
    if (isMissingTable(error)) return { ok: false, error: "os_entry_screen_config missing" };
    return { ok: false, error: error.message };
  }

  // Keep draft revision marker aligned with LIVE (content stays editable draft).
  await sb.from("os_entry_screen_config").upsert(
    {
      ...osEntryConfigToDbRow(
        normalizeOsEntryConfig({
          ...draft.config,
          imageStoragePath,
          imageUrl,
          revision: nextRevision,
          updatedAt: nextLive.updatedAt,
        }),
        "draft"
      ),
      updated_by: updatedBy,
    },
    { onConflict: "lane" }
  );

  return { ok: true, live: nextLive };
}
