import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { APP_META_KEYS, isAppMetaKey, normalizeAppMetaValue } from "@/lib/admin-app-meta/app-meta-keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/app-meta — 관리 키 4종의 현재 값 (없으면 빈 값) */
export async function GET(): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = getSupabaseServer();
  const { data, error } = await sb.from("app_meta").select("key, value, updated_at").in("key", [...APP_META_KEYS]);
  if (error) return NextResponse.json({ ok: false, error: "app_meta_load_failed" }, { status: 500 });

  const byKey = new Map(((data ?? []) as Array<{ key: string; value: string; updated_at: string | null }>).map((r) => [r.key, r]));
  const items = APP_META_KEYS.map((key) => ({
    key,
    value: byKey.get(key)?.value ?? "",
    updatedAt: byKey.get(key)?.updated_at ?? null,
  }));
  return NextResponse.json({ ok: true, items });
}

/** PUT /api/admin/app-meta { key, value } — 형식 검사 후 저장, 빈 값이면 행 삭제(기본 동작 복귀) */
export async function PUT(req: NextRequest): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  let body: { key?: unknown; value?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const key = String(body.key ?? "").trim();
  if (!isAppMetaKey(key)) return NextResponse.json({ ok: false, error: "unknown_key" }, { status: 400 });
  const value = normalizeAppMetaValue(key, body.value);
  if (value === null) return NextResponse.json({ ok: false, error: "invalid_value" }, { status: 400 });

  const sb = getSupabaseServer();
  const { data: beforeRow } = await sb.from("app_meta").select("value").eq("key", key).maybeSingle();
  const before = (beforeRow as { value?: string } | null)?.value ?? "";

  const { error } =
    value === ""
      ? await sb.from("app_meta").delete().eq("key", key)
      : await sb.from("app_meta").upsert({ key, value }, { onConflict: "key" });
  if (error) return NextResponse.json({ ok: false, error: "app_meta_save_failed" }, { status: 500 });

  await appendAdminRouteAudit(sb, req, {
    actorId: admin.userId,
    targetType: "app_meta",
    targetId: key,
    action: "app_meta.update",
    before: { value: before },
    after: { value },
  });
  return NextResponse.json({ ok: true, key, value });
}
