import { NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  auditLogActorTypeCondition,
  parseAuditLogListQuery,
} from "@/lib/admin/audit/admin-audit-log-list-query";
import { adminListRange, escapeAdminIlike } from "@/lib/admin/pagination/parse-admin-list-page";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AUDIT_LOG_SELECT =
  "id, actor_type, actor_id, target_type, target_id, action, before_json, after_json, ip, created_at";

function tableMissing(message: string | undefined): boolean {
  return Boolean(message?.includes("audit_logs") && message.includes("does not exist"));
}

/**
 * 관리자: 감사 로그.
 * - 기존 호출(`limit`·`target_type`·`target_id`) → `{ ok, logs }` 최근 N건 (행위자 전체, 동작 그대로).
 * - 목록 화면(`offset` 또는 `paged=1`) → 필터·서버 페이지네이션 `{ ok, logs, total, limit, offset }`.
 *   query: actor_type(human|admin|user|system|all, 기본 human=시스템·cron 제외) · actor(UUID/닉네임)
 *          · target_type · target_id · action(부분 일치) · from/to(PHT 날짜) · limit(20/50/100) · offset
 */
export async function GET(req: Request) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const parsed = parseAuditLogListQuery(new URL(req.url).searchParams);

  if (parsed.mode === "legacy") {
    let q = sb.from("audit_logs").select(AUDIT_LOG_SELECT).order("created_at", { ascending: false }).limit(parsed.limit);
    if (parsed.targetType) q = q.eq("target_type", parsed.targetType);
    if (parsed.targetId) q = q.eq("target_id", parsed.targetId);
    const { data: rows, error } = await q;
    if (error) {
      if (tableMissing(error.message)) {
        return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
      }
      console.error("[admin/audit-logs]", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, logs: rows ?? [] });
  }

  const { page } = parsed;
  const empty = () => NextResponse.json({ ok: true, logs: [], total: 0, limit: page.limit, offset: page.offset });

  // 행위자 닉네임 검색 → profiles id 목록 (없으면 결과 없음).
  let actorIds: string[] | null = null;
  if (parsed.actor?.kind === "id") actorIds = [parsed.actor.id];
  else if (parsed.actor?.kind === "nickname") {
    const { data: hits } = await sb
      .from("profiles")
      .select("id")
      .ilike("nickname", `%${escapeAdminIlike(parsed.actor.text)}%`)
      .limit(200);
    actorIds = ((hits ?? []) as { id?: string }[]).map((p) => String(p.id ?? "")).filter(Boolean);
    if (actorIds.length === 0) return empty();
  }

  const [from, to] = adminListRange(page);
  let q = sb
    .from("audit_logs")
    .select(AUDIT_LOG_SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);
  const actorCond = auditLogActorTypeCondition(parsed.actorFilter);
  if (actorCond?.op === "eq") q = q.eq("actor_type", actorCond.value);
  else if (actorCond?.op === "not_in") q = q.not("actor_type", "in", `(${actorCond.values.join(",")})`);
  if (actorIds) q = q.in("actor_id", actorIds);
  if (parsed.targetType) q = q.eq("target_type", parsed.targetType);
  if (parsed.targetId) q = q.eq("target_id", parsed.targetId);
  if (parsed.actionContains) q = q.ilike("action", `%${escapeAdminIlike(parsed.actionContains)}%`);
  if (parsed.fromIso) q = q.gte("created_at", parsed.fromIso);
  if (parsed.toIso) q = q.lt("created_at", parsed.toIso);

  const { data: rows, error, count } = await q;
  if (error) {
    if (tableMissing(error.message)) {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    console.error("[admin/audit-logs]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const list = (rows ?? []) as { actor_id: string | null }[];
  const ids = [...new Set(list.map((r) => r.actor_id).filter((v): v is string => Boolean(v)))];
  const nickById = new Map<string, string>();
  if (ids.length) {
    const { data: profiles } = await sb.from("profiles").select("id, nickname").in("id", ids);
    for (const p of (profiles ?? []) as { id: string; nickname: string | null }[]) {
      if (p.nickname) nickById.set(String(p.id), p.nickname);
    }
  }
  const logs = list.map((r) => ({ ...r, actor_nickname: r.actor_id ? nickById.get(r.actor_id) ?? null : null }));

  return NextResponse.json({ ok: true, logs, total: count ?? logs.length, limit: page.limit, offset: page.offset });
}
