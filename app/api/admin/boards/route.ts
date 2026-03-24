import { NextRequest, NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { parseCreateBoardBody } from "@/lib/admin-boards/parse-create-board-body";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const dynamic = "force-dynamic";

/** 관리자: 게시판 생성 (boards RLS에 INSERT 없음 → 서비스 롤) */
export async function POST(req: NextRequest) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = parseCreateBoardBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data: svc, error: svcErr } = await sb.from("services").select("id").eq("id", parsed.data.service_id).maybeSingle();

  if (svcErr) {
    console.error("[POST admin/boards] service lookup", svcErr);
    return NextResponse.json({ ok: false, error: svcErr.message }, { status: 500 });
  }
  if (!svc) {
    return NextResponse.json({ ok: false, error: "service_not_found" }, { status: 400 });
  }

  const insertRow = {
    service_id: parsed.data.service_id,
    name: parsed.data.name,
    slug: parsed.data.slug,
    description: parsed.data.description,
    skin_type: parsed.data.skin_type,
    form_type: parsed.data.form_type,
    category_mode: parsed.data.category_mode,
    policy: parsed.data.policy,
    is_active: parsed.data.is_active,
    sort_order: parsed.data.sort_order,
  };

  const { data: created, error: insErr } = await sb.from("boards").insert(insertRow).select("id, slug, name, service_id").single();

  if (insErr) {
    const msg = insErr.message ?? "";
    if (msg.includes("duplicate") || msg.includes("unique") || insErr.code === "23505") {
      return NextResponse.json({ ok: false, error: "duplicate_slug" }, { status: 409 });
    }
    if (msg.includes("boards") && msg.includes("does not exist")) {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    console.error("[POST admin/boards] insert", insErr);
    return NextResponse.json({ ok: false, error: msg || "insert_failed" }, { status: 500 });
  }

  const row = created as { id: string; slug: string; name: string; service_id: string };
  const actorId = await getRouteUserId();
  const rm = getAuditRequestMeta(req);
  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: actorId,
    target_type: "board",
    target_id: row.id,
    action: "boards.create",
    after_json: { id: row.id, slug: row.slug, name: row.name, service_id: row.service_id },
    ip: rm.ip,
    user_agent: rm.userAgent,
  });

  return NextResponse.json({ ok: true, board: row });
}
