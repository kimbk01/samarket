import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  HOME_LAYOUT_SERVER_CACHE_TAG,
  HOME_LAYOUT_SETTINGS_KEY,
  validateHomeLayoutPayload,
} from "@/lib/home/home-layout-contract";
import { loadHomeLayoutFromStore } from "@/lib/home/load-home-layout-server";
import { loadHomeCatalogFromStore } from "@/lib/home/load-home-catalog-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 어드민 「홈 구성」 — 조회는 관리자 전원. 분류 목록(배달 업종·거래 카테고리·정보교환 주제)을 함께 준다 */
export async function GET() {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  try {
    const [payload, catalog] = await Promise.all([loadHomeLayoutFromStore(), loadHomeCatalogFromStore()]);
    return NextResponse.json({ ok: true as const, ...payload, catalog });
  } catch (e) {
    console.error("[GET admin home-layout] read failed", e);
    return NextResponse.json({ ok: false, error: "read_failed" }, { status: 503 });
  }
}

/**
 * 저장 — `settings` 권한. 본문 `{ config, expectedRevision }`.
 * 읽어 온 판(`expectedRevision` = 읽을 때의 `updated_at`, 처음이면 null)과 지금 판이 다르면 409 로 멈춘다.
 */
export async function PUT(req: NextRequest) {
  const gate = await requireAdminPermission("settings");
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const validated = validateHomeLayoutPayload(body.config);
  if (!validated.ok) return NextResponse.json({ ok: false, error: validated.error }, { status: 400 });
  const expected = body.expectedRevision;
  if (expected !== null && typeof expected !== "string") {
    return NextResponse.json({ ok: false, error: "invalid_expected_revision" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  // 읽기 오류를 「저장값 없음」으로 오해해 처음 저장(insert)으로 가지 않도록 503 으로 멈춘다 (감사 E15)
  let current: Awaited<ReturnType<typeof loadHomeLayoutFromStore>>;
  try {
    current = await loadHomeLayoutFromStore();
  } catch (e) {
    console.error("[PUT admin home-layout] read failed", e);
    return NextResponse.json({ ok: false, error: "read_failed" }, { status: 503 });
  }
  if ((current.revision ?? null) !== (expected ?? null)) {
    return NextResponse.json(
      { ok: false, error: "stale_revision", revision: current.revision },
      { status: 409 }
    );
  }

  const nextUpdatedAt = new Date().toISOString();
  const value = validated.config as unknown as Record<string, unknown>;
  if (expected === null) {
    // 처음 저장 — 같은 순간 다른 저장이 먼저 들어가면 키 중복으로 실패 → 409
    const { error } = await sb
      .from("admin_settings")
      .insert({ key: HOME_LAYOUT_SETTINGS_KEY, value_json: value, updated_at: nextUpdatedAt });
    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ ok: false, error: "stale_revision" }, { status: 409 });
      }
      console.error("[PUT admin home-layout insert]", error);
      return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
    }
  } else {
    const { data, error } = await sb
      .from("admin_settings")
      .update({ value_json: value, updated_at: nextUpdatedAt })
      .eq("key", HOME_LAYOUT_SETTINGS_KEY)
      .eq("updated_at", expected)
      .select("key");
    if (error) {
      console.error("[PUT admin home-layout update]", error);
      return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
    }
    if (!data || data.length === 0) {
      return NextResponse.json({ ok: false, error: "stale_revision" }, { status: 409 });
    }
  }

  const rm = getAuditRequestMeta(req);
  // 저장 기록은 응답 전에 끝낸다(서버리스에서 응답 뒤 유실 방지 — 감사 누락 2026-11-09)
  await appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: gate.actor.userId,
    target_type: "home_layout",
    target_id: "global",
    action: "home_layout.update",
    before_json: current.source === "db" ? { value_json: current.config } : null,
    after_json: { value_json: validated.config },
    ip: rm.ip,
    user_agent: rm.userAgent,
  });
  // 즉시 만료 — "default" 는 옛 값을 먼저 주는 방식이라 저장 직후 첫 요청이 옛 구성을 받는다 (감사 E6)
  revalidateTag(HOME_LAYOUT_SERVER_CACHE_TAG, { expire: 0 });

  try {
    const saved = await loadHomeLayoutFromStore();
    return NextResponse.json({ ok: true as const, ...saved });
  } catch {
    return NextResponse.json({ ok: true as const, source: "db" as const, config: validated.config, revision: nextUpdatedAt });
  }
}
