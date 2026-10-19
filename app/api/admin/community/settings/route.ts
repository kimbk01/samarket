import { requireCommunityAdmin } from "@/lib/admin/community-admin/community-admin-guards";
import { appendCommunityAdminAudit } from "@/lib/admin/community-admin/community-admin-audit";
import {
  diffCommunityFeedOps,
  mergeCommunityFeedOpsWithCurrent,
  pickCommunityFeedOpsPatch,
  sameSettingsTimestamp,
} from "@/lib/admin/community-admin/community-settings-merge";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { COMMUNITY_FEED_OPS_KEY, mergeCommunityFeedOps } from "@/lib/community-feed/community-ops-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SettingsRow = { value_json?: Record<string, unknown> | null; updated_at?: string | null };

function isMissingTable(msg: string | undefined): boolean {
  return !!msg && msg.includes("admin_settings") && msg.includes("does not exist");
}

/** GET → { ok, settings, updatedAt: string|null } — updatedAt 은 PUT 의 expectedUpdatedAt 으로 그대로 돌려준다 */
export async function GET() {
  const gate = await requireCommunityAdmin("content");
  if (!gate.ok) return gate.response;
  try {
    const sb = getSupabaseServer();
    const { data, error } = await sb
      .from("admin_settings")
      .select("value_json, updated_at")
      .eq("key", COMMUNITY_FEED_OPS_KEY)
      .maybeSingle();
    if (error && !error.message?.includes("does not exist")) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    const row = (data ?? null) as SettingsRow | null;
    const ops = mergeCommunityFeedOps(row?.value_json ?? {});
    return NextResponse.json({ ok: true, settings: ops, updatedAt: row?.updated_at ?? null });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 503 });
  }
}

/**
 * PUT { ...변경할 설정 필드, expectedUpdatedAt: string|null }
 * - 현재 저장값 위에 요청 필드만 덮는다 (C-29).
 * - 저장된 행이 있으면 expectedUpdatedAt 필수, 다르면 409 { error: "conflict", settings, updatedAt }.
 */
export async function PUT(req: NextRequest) {
  const gate = await requireCommunityAdmin("content");
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const expectedRaw = body.expectedUpdatedAt ?? body.expected_updated_at;
  const expectedUpdatedAt = typeof expectedRaw === "string" && expectedRaw.trim() ? expectedRaw.trim() : null;
  const patch = pickCommunityFeedOpsPatch(body);
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "no_fields" }, { status: 400 });
  }

  try {
    const sb = getSupabaseServer();
    const { data: curData, error: curErr } = await sb
      .from("admin_settings")
      .select("value_json, updated_at")
      .eq("key", COMMUNITY_FEED_OPS_KEY)
      .maybeSingle();
    if (curErr) {
      if (isMissingTable(curErr.message)) {
        return NextResponse.json({ ok: false, error: "admin_settings_table_missing" }, { status: 503 });
      }
      return NextResponse.json({ ok: false, error: curErr.message }, { status: 500 });
    }
    const current = (curData ?? null) as SettingsRow | null;
    const currentOps = mergeCommunityFeedOps(current?.value_json ?? {});
    const conflict = () =>
      NextResponse.json(
        { ok: false, error: "conflict", settings: currentOps, updatedAt: current?.updated_at ?? null },
        { status: 409 }
      );

    if (current) {
      if (!expectedUpdatedAt) {
        return NextResponse.json(
          { ok: false, error: "expected_updated_at_required", settings: currentOps, updatedAt: current.updated_at ?? null },
          { status: 409 }
        );
      }
      if (!sameSettingsTimestamp(expectedUpdatedAt, current.updated_at ?? null)) return conflict();
    } else if (expectedUpdatedAt) {
      // 화면은 저장 행이 있다고 보지만 지금은 없음 → 다른 관리자가 지운 상태
      return conflict();
    }

    const merged = mergeCommunityFeedOpsWithCurrent(current?.value_json ?? {}, patch);
    const diff = diffCommunityFeedOps(currentOps, merged);
    const nowIso = new Date().toISOString();

    if (current) {
      let q = sb
        .from("admin_settings")
        .update({ value_json: merged as unknown as Record<string, unknown>, updated_at: nowIso })
        .eq("key", COMMUNITY_FEED_OPS_KEY);
      q = current.updated_at == null ? q.is("updated_at", null) : q.eq("updated_at", current.updated_at);
      const { data: upd, error } = await q.select("updated_at");
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      if (!upd || upd.length === 0) return conflict();
    } else {
      const { error } = await sb.from("admin_settings").insert({
        key: COMMUNITY_FEED_OPS_KEY,
        value_json: merged as unknown as Record<string, unknown>,
        updated_at: nowIso,
      });
      if (error) {
        if (error.code === "23505") return conflict();
        if (isMissingTable(error.message)) {
          return NextResponse.json({ ok: false, error: "admin_settings_table_missing" }, { status: 503 });
        }
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }
    }

    const audit = await appendCommunityAdminAudit(sb, req, {
      actorId: gate.userId,
      targetType: "community_settings",
      targetId: COMMUNITY_FEED_OPS_KEY,
      action: "community_settings.update",
      before: { ...diff.before, updated_at: current?.updated_at ?? null },
      after: { ...diff.after, changed_fields: diff.changed, updated_at: nowIso },
    });
    return NextResponse.json({
      ok: true,
      settings: merged,
      updatedAt: nowIso,
      changedFields: diff.changed,
      ...(audit.ok ? {} : { audit_warning: "audit_failed" }),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 503 });
  }
}
