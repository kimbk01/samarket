/**
 * R17-OS admin server access — PENDING os launch config (Supabase) + current BUILD config (repo).
 * Admin/API only. App runtime must never import this module (OS visuals are build-time).
 */
import buildConfigJson from "@/config/os-launch.json";
import {
  OS_LAUNCH_ROW_ID,
  OS_LAUNCH_STORAGE_BUCKET,
  OS_LAUNCH_TABLE,
  normalizeOsLaunchHex,
  type OsLaunchBuildConfig,
  type OsLaunchLogoRef,
  type OsLaunchPending,
} from "./contract";
import type { getSupabaseServer } from "@/lib/chat/supabase-server";

type Sb = ReturnType<typeof getSupabaseServer>;

type Row = {
  id: string;
  background_color: string;
  logo_storage_path: string | null;
  logo_width: number | null;
  logo_height: number | null;
  logo_sha256: string | null;
  updated_at: string | null;
  updated_by: string | null;
};

/** The values the CURRENT committed native resources were generated from. */
export function getOsLaunchBuildConfig(): OsLaunchBuildConfig {
  const raw = buildConfigJson as unknown as OsLaunchBuildConfig;
  return {
    version: raw.version,
    backgroundColor: normalizeOsLaunchHex(raw.backgroundColor) ?? "#075740",
    logo: raw.logo,
    appliedFromAdmin: raw.appliedFromAdmin ?? null,
  };
}

function rowToPending(row: Row): OsLaunchPending {
  const logo: OsLaunchLogoRef | null =
    row.logo_storage_path && row.logo_sha256 && row.logo_width && row.logo_height
      ? {
          source: row.logo_storage_path,
          width: row.logo_width,
          height: row.logo_height,
          sha256: row.logo_sha256,
        }
      : null;
  return {
    backgroundColor: normalizeOsLaunchHex(row.background_color) ?? row.background_color,
    logo,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

export type LoadPendingResult =
  | { ok: true; pending: OsLaunchPending | null }
  | { ok: false; error: string };

export async function loadOsLaunchPending(sb: Sb): Promise<LoadPendingResult> {
  const { data, error } = await sb
    .from(OS_LAUNCH_TABLE)
    .select(
      "id, background_color, logo_storage_path, logo_width, logo_height, logo_sha256, updated_at, updated_by"
    )
    .eq("id", OS_LAUNCH_ROW_ID)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, pending: data ? rowToPending(data as Row) : null };
}

export type SavePendingInput = {
  backgroundColor: string;
  /** undefined = keep pending logo as is; null = clear (keep current build logo). */
  logo?: OsLaunchLogoRef | null;
};

export async function saveOsLaunchPending(
  sb: Sb,
  input: SavePendingInput,
  userId: string
): Promise<{ ok: true; pending: OsLaunchPending } | { ok: false; error: string }> {
  const color = normalizeOsLaunchHex(input.backgroundColor);
  if (!color) return { ok: false, error: "invalid_color" };

  const patch: Record<string, unknown> = {
    id: OS_LAUNCH_ROW_ID,
    background_color: color,
    updated_at: new Date().toISOString(),
    updated_by: userId,
  };
  if (input.logo !== undefined) {
    patch.logo_storage_path = input.logo?.source ?? null;
    patch.logo_width = input.logo?.width ?? null;
    patch.logo_height = input.logo?.height ?? null;
    patch.logo_sha256 = input.logo?.sha256 ?? null;
  }

  const { data, error } = await sb
    .from(OS_LAUNCH_TABLE)
    .upsert(patch, { onConflict: "id" })
    .select(
      "id, background_color, logo_storage_path, logo_width, logo_height, logo_sha256, updated_at, updated_by"
    )
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "save_failed" };
  return { ok: true, pending: rowToPending(data as Row) };
}

/** Short-lived URL so the admin preview can show the private pending logo. */
export async function signOsLaunchLogoUrl(sb: Sb, storagePath: string): Promise<string | null> {
  const { data, error } = await sb.storage
    .from(OS_LAUNCH_STORAGE_BUCKET)
    .createSignedUrl(storagePath, 60 * 10);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function uploadOsLaunchLogo(
  sb: Sb,
  path: string,
  bytes: Uint8Array
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await sb.storage.from(OS_LAUNCH_STORAGE_BUCKET).upload(path, bytes, {
    contentType: "image/png",
    upsert: false,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function removeOsLaunchLogo(sb: Sb, path: string): Promise<void> {
  await sb.storage.from(OS_LAUNCH_STORAGE_BUCKET).remove([path]);
}
