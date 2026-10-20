import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { parseAdminReason } from "@/lib/admin/operator-ux/admin-reason";
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
import {
  parseAdminJsonListPage,
  sliceAdminJsonList,
  sortAdminJsonListNewestFirst,
} from "@/lib/admin/pagination/admin-json-list-page";

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

/**
 * 관리자 설정 번들 조회.
 * `?part=change-logs` — 변경 이력만 서버 페이지로 (`limit` 20/50/100 · `offset`) → `{ items, total }` (R7).
 * 파라미터가 없으면 기존 번들 응답 그대로.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  if (req.nextUrl.searchParams.get("part") === "change-logs") {
    try {
      const loaded = await loadAppSettingsBundleFromDb(getSupabaseServer());
      if (!loaded.ok && loaded.reason !== "missing_table") {
        return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
      }
      const logs = loaded.ok ? loaded.bundle.changeLogs ?? [] : [];
      return NextResponse.json({
        ok: true,
        ...sliceAdminJsonList(sortAdminJsonListNewestFirst(logs), parseAdminJsonListPage(req.nextUrl.searchParams)),
      });
    } catch {
      return NextResponse.json({ ok: false, error: "server_config" }, { status: 503 });
    }
  }

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

  let body: { settings?: Partial<AppSettings>; bundle?: unknown; reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const reason = parseAdminReason(body.reason);

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
    await appendAdminRouteAudit(sb, req, {
      actorId: admin.userId,
      targetType: "app_settings",
      targetId: "global",
      action: "app_settings.update",
      before: before as unknown as Record<string, unknown>,
      after: {
        ...(nextBundle.settings as unknown as Record<string, unknown>),
        // 초기화(dataReset L3) 확인창 사유 — 선택 (저장은 L1 이라 사유 없음)
        ...(reason ? { reason } : {}),
      },
    });
    return NextResponse.json({ ok: true, bundle: nextBundle });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
