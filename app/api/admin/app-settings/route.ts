import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { labelFromDisplayAndUsername } from "@/lib/users/user-label";
import {
  appendSettingChangeLogs,
  buildSettingChangeLogs,
  createDefaultAppSettingsBundle,
  loadAppSettingsBundleFromDb,
  saveAppSettingsBundleToDb,
  type AppSettingsBundleV1,
} from "@/lib/admin-settings/app-settings-db";
import type { AppSettings } from "@/lib/types/admin-settings";
import { DEFAULT_APP_SETTINGS } from "@/lib/admin-settings/admin-settings-utils";
import { invalidateAppSettingsServerCache } from "@/lib/admin-settings/get-app-settings-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isBundle(x: unknown): x is AppSettingsBundleV1 {
  return x != null && typeof x === "object" && (x as AppSettingsBundleV1).version === 1;
}

function mergeSettings(base: AppSettings, incoming: Partial<AppSettings>): AppSettings {
  return {
    ...base,
    ...incoming,
    updatedAt: new Date().toISOString(),
  };
}

export async function GET(): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  try {
    const sb = getSupabaseServer();
    const loaded = await loadAppSettingsBundleFromDb(sb);
    if (loaded.ok) {
      return NextResponse.json({ ok: true, bundle: loaded.bundle, source: loaded.source });
    }
    return NextResponse.json({
      ok: true,
      bundle: createDefaultAppSettingsBundle(),
      source: "default",
      hint: loaded.message,
    });
  } catch (e) {
    return NextResponse.json({
      ok: true,
      bundle: createDefaultAppSettingsBundle(),
      source: "default",
      hint: String(e),
    });
  }
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  let body: { settings?: Partial<AppSettings>; bundle?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  try {
    const sb = getSupabaseServer();
    const loaded = await loadAppSettingsBundleFromDb(sb);
    const baseBundle = loaded.ok ? loaded.bundle : createDefaultAppSettingsBundle();
    const before = { ...DEFAULT_APP_SETTINGS, ...baseBundle.settings };

    let nextBundle: AppSettingsBundleV1;
    if (isBundle(body.bundle)) {
      nextBundle = body.bundle;
    } else if (body.settings && typeof body.settings === "object") {
      const after = mergeSettings(before, body.settings);
      const { data: prof } = await sb
        .from("profiles")
        .select("display_name, nickname, username")
        .eq("id", admin.userId)
        .maybeSingle();
      const nick = labelFromDisplayAndUsername(
        String(prof?.display_name ?? prof?.nickname ?? ""),
        String(prof?.username ?? "")
      );
      const logs = buildSettingChangeLogs(before, body.settings, admin.userId, nick || "admin");
      nextBundle = {
        version: 1,
        settings: after,
        changeLogs: appendSettingChangeLogs(baseBundle, logs).changeLogs,
      };
    } else {
      return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
    }

    const saved = await saveAppSettingsBundleToDb(sb, nextBundle);
    if (!saved.ok) return NextResponse.json({ ok: false, error: saved.error }, { status: 503 });
    invalidateAppSettingsServerCache();
    return NextResponse.json({ ok: true, bundle: nextBundle });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
