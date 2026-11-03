import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireTradeAdmin } from "@/lib/admin/trade-admin/trade-admin-guards";
import { appendCommunityAdminAudit } from "@/lib/admin/community-admin/community-admin-audit";
import {
  TRADE_SETTINGS_KEY,
  mergeTradeDetailOpsSettings,
  type TradeDetailOpsSettings,
} from "@/services/trade/trade-settings.service";
import { invalidateTradeSoldVisibleWindowCache } from "@/lib/trade/marketplace/sold-visible-window.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type TradeSettingsHistoryRow = {
  id: string;
  at: string;
  adminLabel: string | null;
  beforeDays: number | null;
  afterDays: number | null;
};

/** 변경 내역 — `trade_settings.update` 감사 로그 최신 10건 (바꾸기 전·후 판매완료 노출 기간) */
async function loadHistory(sb: SupabaseClient): Promise<TradeSettingsHistoryRow[]> {
  const { data } = await sb
    .from("audit_logs")
    .select("id, actor_id, before_json, after_json, created_at")
    .eq("target_type", "trade_settings")
    .eq("target_id", TRADE_SETTINGS_KEY)
    .order("created_at", { ascending: false })
    .limit(10);
  const rows = (data ?? []) as {
    id: string;
    actor_id: string | null;
    before_json: Record<string, unknown> | null;
    after_json: Record<string, unknown> | null;
    created_at: string;
  }[];
  const ids = [...new Set(rows.map((r) => r.actor_id).filter((v): v is string => Boolean(v)))];
  const names: Record<string, string> = {};
  if (ids.length > 0) {
    const { data: profs } = await sb.from("profiles").select("id, nickname").in("id", ids);
    for (const p of (profs ?? []) as { id: string; nickname?: string | null }[]) {
      const nick = String(p.nickname ?? "").trim();
      if (nick) names[p.id] = nick;
    }
  }
  const days = (v: Record<string, unknown> | null) =>
    v && Number.isFinite(Number(v.completedVisibleDays)) ? Number(v.completedVisibleDays) : null;
  return rows.map((r) => ({
    id: String(r.id),
    at: String(r.created_at),
    adminLabel: r.actor_id ? names[r.actor_id] ?? null : null,
    beforeDays: days(r.before_json),
    afterDays: days(r.after_json),
  }));
}

async function readStored(sb: SupabaseClient) {
  const { data, error } = await sb.from("admin_settings").select("value_json").eq("key", TRADE_SETTINGS_KEY).maybeSingle();
  return {
    error,
    exists: Boolean(data),
    raw: ((data as { value_json?: Record<string, unknown> } | null)?.value_json ?? null) as Record<string, unknown> | null,
  };
}

export async function GET() {
  const admin = await requireTradeAdmin();
  if (!admin.ok) return admin.response;
  try {
    const sb = admin.sb;
    const stored = await readStored(sb);
    if (stored.error && !stored.error.message?.includes("does not exist")) {
      return NextResponse.json({ ok: false, error: stored.error.message }, { status: 500 });
    }
    const settings = mergeTradeDetailOpsSettings(stored.raw ?? {});
    const history = await loadHistory(sb).catch(() => []);
    return NextResponse.json({ ok: true, settings, history });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 503 });
  }
}

/**
 * 저장 — 화면이 읽은 `revision` 과 지금 저장값의 revision 이 다르면 409(다른 관리자가 먼저 저장) · 덮어쓰지 않는다.
 * 같은 revision 일 때만 바꾸는 조건부 UPDATE(동시 저장 1건만 성공).
 */
export async function PUT(req: NextRequest) {
  const admin = await requireTradeAdmin();
  if (!admin.ok) return admin.response;

  let body: Partial<TradeDetailOpsSettings>;
  try {
    body = (await req.json()) as Partial<TradeDetailOpsSettings>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  try {
    const sb = admin.sb;
    const stored = await readStored(sb);
    if (stored.error) {
      if (stored.error.message?.includes("admin_settings") && stored.error.message.includes("does not exist")) {
        return NextResponse.json({ ok: false, error: "admin_settings_table_missing" }, { status: 503 });
      }
      return NextResponse.json({ ok: false, error: stored.error.message }, { status: 500 });
    }
    const current = mergeTradeDetailOpsSettings(stored.raw ?? {});
    const conflict = () =>
      loadHistory(sb)
        .catch(() => [])
        .then((history) =>
          NextResponse.json({ ok: false, error: "revision_conflict", settings: current, history }, { status: 409 })
        );
    if (body.revision != null && Math.floor(Number(body.revision)) !== current.revision) {
      return conflict();
    }

    const merged = mergeTradeDetailOpsSettings({ ...(body ?? {}), revision: current.revision + 1 });
    const now = new Date().toISOString();
    if (stored.exists) {
      let q = sb
        .from("admin_settings")
        .update({ value_json: merged as unknown as Record<string, unknown>, updated_at: now })
        .eq("key", TRADE_SETTINGS_KEY);
      /** 저장값에 revision 이 아직 없으면(처음) null 조건 */
      q =
        stored.raw && stored.raw.revision != null
          ? q.filter("value_json->>revision", "eq", String(current.revision))
          : q.is("value_json->>revision", null);
      const { data: updated, error } = await q.select("key");
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      if (!Array.isArray(updated) || updated.length === 0) return conflict();
    } else {
      const { error } = await sb
        .from("admin_settings")
        .insert({ key: TRADE_SETTINGS_KEY, value_json: merged as unknown as Record<string, unknown>, updated_at: now });
      if (error) {
        if (error.code === "23505") return conflict();
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }
    }
    invalidateTradeSoldVisibleWindowCache();

    const audit = await appendCommunityAdminAudit(sb, req, {
      actorId: admin.userId,
      targetType: "trade_settings",
      targetId: TRADE_SETTINGS_KEY,
      action: "trade_settings.update",
      before: stored.raw ? (current as unknown as Record<string, unknown>) : null,
      after: merged as unknown as Record<string, unknown>,
    });
    const history = await loadHistory(sb).catch(() => []);
    return NextResponse.json({ ok: true, settings: merged, history, ...(audit.ok ? {} : { auditWarning: true }) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 503 });
  }
}
