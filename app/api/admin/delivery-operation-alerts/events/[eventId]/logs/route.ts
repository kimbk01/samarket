import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function dedupeStrings(ids: Iterable<unknown>): string[] {
  const s = new Set<string>();
  for (const x of ids) {
    const v = String(x ?? "").trim();
    if (v) s.add(v);
  }
  return [...s];
}

/**
 * GET 단건 이벤트 감사 로그 (목록과 분리 · 상한 100).
 */
export async function GET(req: Request, ctx: { params: Promise<{ eventId: string }> }) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { eventId } = await ctx.params;
  const id = String(eventId ?? "").trim();
  if (!id) return NextResponse.json({ error: "invalid_event_id" }, { status: 400 });

  const sp = new URL(req.url).searchParams;
  const order = sp.get("order")?.trim() === "asc" ? "asc" : "desc";
  const limitRaw = Number(sp.get("limit") ?? "100");
  const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, Math.floor(limitRaw))) : 100;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ error: "server_config" }, { status: 500 });
  }

  const sbAny = sb as any;

  const { data: rows, error } = await sbAny
    .from("delivery_operation_alert_event_logs")
    .select(
      "id, event_id, action_type, actor_admin_id, previous_status, next_status, previous_assignee, next_assignee, note, metadata, created_at"
    )
    .eq("event_id", id)
    .order("created_at", { ascending: order === "asc" })
    .limit(limit);

  if (error) {
    const msg = String(error.message ?? "");
    if (/delivery_operation_alert_event_logs|does not exist|column/i.test(msg)) {
      return NextResponse.json({ error: "schema_missing", hint: "Apply migration delivery_alert_audit_logs" }, { status: 503 });
    }
    return NextResponse.json({ error: msg.slice(0, 200) }, { status: 500 });
  }

  const logs = Array.isArray(rows) ? rows : [];
  const ids = dedupeStrings(
    logs.flatMap((r: Record<string, unknown>) => [r.actor_admin_id, r.previous_assignee, r.next_assignee])
  );

  let labelById = new Map<string, string>();
  if (ids.length > 0) {
    const { data: profs } = await sbAny.from("profiles").select("id, nickname, username").in("id", ids);
    for (const p of (profs ?? []) as { id?: string; nickname?: string | null; username?: string | null }[]) {
      const pid = String(p.id ?? "");
      if (!pid) continue;
      labelById.set(pid, String(p.nickname ?? p.username ?? pid).trim().slice(0, 48) || pid.slice(0, 8));
    }
  }

  const enriched = logs.map((r: Record<string, unknown>) => {
    const aid = String(r.actor_admin_id ?? "");
    const pa = String(r.previous_assignee ?? "");
    const na = String(r.next_assignee ?? "");
    return {
      ...r,
      actor_label: aid ? labelById.get(aid) ?? aid.slice(0, 8) : "",
      previous_assignee_label: pa ? labelById.get(pa) ?? pa.slice(0, 8) : "",
      next_assignee_label: na ? labelById.get(na) ?? na.slice(0, 8) : "",
    };
  });

  return NextResponse.json({
    logs: enriched,
    query: { event_id: id, order, limit },
  });
}
