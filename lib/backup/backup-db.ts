/**
 * `admin_settings` 에 백업 번들 영속화
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { BACKUP_SETTINGS_KEY } from "@/lib/backup/backup-keys";
import type { BackupBundleV1 } from "@/lib/backup/backup-state";
import { createDefaultBackupBundle } from "@/lib/backup/backup-state";

function isMissingAdminSettings(err: { message?: string; code?: string }): boolean {
  const m = (err.message ?? "").toLowerCase();
  return err.code === "42P01" || (m.includes("relation") && m.includes("admin_settings"));
}

function parseBundle(raw: unknown): BackupBundleV1 | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== 1) return null;
  if (!Array.isArray(o.snapshots)) return null;
  return {
    version: 1,
    snapshots: o.snapshots as BackupBundleV1["snapshots"],
    items: Array.isArray(o.items) ? (o.items as BackupBundleV1["items"]) : [],
    restores: Array.isArray(o.restores) ? (o.restores as BackupBundleV1["restores"]) : [],
  };
}

export async function loadBackupBundleFromDb(
  sb: SupabaseClient
): Promise<
  | { ok: true; bundle: BackupBundleV1; source: "db" | "default" }
  | { ok: false; reason: "missing_table" | "error"; message?: string }
> {
  const { data, error } = await sb
    .from("admin_settings")
    .select("value_json")
    .eq("key", BACKUP_SETTINGS_KEY)
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
    return { ok: true, bundle: createDefaultBackupBundle(), source: "default" };
  }
  return { ok: true, bundle: parsed, source: "db" };
}

export async function saveBackupBundleToDb(
  sb: SupabaseClient,
  bundle: BackupBundleV1
): Promise<{ ok: true } | { ok: false; error: string }> {
  const value_json = {
    payload: bundle,
    updated_at: new Date().toISOString(),
  };
  const { error } = await sb.from("admin_settings").upsert(
    {
      key: BACKUP_SETTINGS_KEY,
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
