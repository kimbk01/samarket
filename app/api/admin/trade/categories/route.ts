import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireTradeAdmin } from "@/lib/admin/trade-admin/trade-admin-guards";
import { readJsonBody } from "@/lib/admin/trade-admin/trade-admin-rpc";
import { ADMIN_REASON_REQUIRED_CODE, parseAdminReason } from "@/lib/admin/operator-ux/admin-reason";
import { appendCommunityAdminAudit } from "@/lib/admin/community-admin/community-admin-audit";
import { communityAdminUuidOrNull } from "@/lib/admin/community-admin/community-admin-period";
import {
  parseTradeFieldCompositionPayload,
  serializeTradeFieldCompositionPayload,
} from "@/lib/trade/category-form/parse-field-composition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 관리자가 바꿀 수 있는 categories 컬럼 */
const CATEGORY_COLUMNS = new Set([
  "name",
  "name_en",
  "slug",
  "icon_key",
  "type",
  "sort_order",
  "is_active",
  "description",
  "quick_create_enabled",
  "quick_create_group",
  "quick_create_order",
  "show_in_home_chips",
  "parent_id",
]);
const SETTINGS_COLUMNS = new Set([
  "can_write",
  "has_price",
  "has_chat",
  "has_location",
  "has_direct_deal",
  "has_free_share",
  "post_type",
  "field_composition",
]);
const SETTINGS_DEFAULTS = {
  can_write: true,
  has_price: false,
  has_chat: false,
  has_location: true,
  has_direct_deal: true,
  has_free_share: true,
  post_type: "normal",
};

function pick(src: unknown, allowed: Set<string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!src || typeof src !== "object" || Array.isArray(src)) return out;
  for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
    if (allowed.has(k) && v !== undefined) out[k] = v;
  }
  return out;
}

function settingsRow(categoryId: string, raw: unknown): { ok: true; row: Record<string, unknown> } | { ok: false; error: string } {
  const s = pick(raw, SETTINGS_COLUMNS);
  const row: Record<string, unknown> = { ...SETTINGS_DEFAULTS, ...s, category_id: categoryId, updated_at: new Date().toISOString() };
  if ("field_composition" in s) {
    if (s.field_composition == null) row.field_composition = null;
    else {
      const parsed = parseTradeFieldCompositionPayload(s.field_composition);
      if (!parsed) return { ok: false, error: "invalid_field_composition" };
      row.field_composition = serializeTradeFieldCompositionPayload(parsed);
    }
  }
  return { ok: true, row };
}

async function audit(sb: SupabaseClient, req: NextRequest, actorId: string, targetId: string, action: string, before: unknown, after: unknown) {
  return appendCommunityAdminAudit(sb, req, {
    actorId,
    targetType: "trade_category",
    targetId,
    action: `trade_category.${action}`,
    before: (before as Record<string, unknown> | null) ?? null,
    after: (after as Record<string, unknown> | null) ?? null,
  });
}

/**
 * POST /api/admin/trade/categories — 카테고리 쓰기 (설계 v2 §C-9 · D-05 · D-27)
 * 브라우저 직접 쓰기(RLS 로 막혀 0행인데 「성공」 표시)를 대체한다. 서비스 롤 + 반영 행 확인 + 감사.
 * body.op:
 *  - create { category, settings }
 *  - update { id, category?, settings? }
 *  - delete { id, reason } — 사유 필수(R2 · L3). 글·하위 카테고리가 있으면 409 (비활성 권장)
 *  - reorder { orderedIds } — 0,1,2… 순서 부여
 */
export async function POST(req: NextRequest) {
  const admin = await requireTradeAdmin();
  if (!admin.ok) return admin.response;
  const sb = admin.sb;
  const body = await readJsonBody(req);
  if (!body) return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  const op = String(body.op ?? "");
  const now = new Date().toISOString();

  if (op === "create") {
    const cat = pick(body.category, CATEGORY_COLUMNS);
    if (!String(cat.name ?? "").trim() || !String(cat.slug ?? "").trim()) {
      return NextResponse.json({ ok: false, error: "name_slug_required" }, { status: 400 });
    }
    const { data, error } = await sb
      .from("categories")
      .insert({ quick_create_enabled: true, quick_create_order: 0, show_in_home_chips: true, ...cat })
      .select("*")
      .single();
    if (error || !data) return NextResponse.json({ ok: false, error: error?.message ?? "create_failed" }, { status: 400 });
    const id = String((data as { id: string }).id);
    const st = settingsRow(id, body.settings);
    if (!st.ok) {
      await sb.from("categories").delete().eq("id", id);
      return NextResponse.json({ ok: false, error: st.error }, { status: 400 });
    }
    const { error: sErr } = await sb.from("category_settings").upsert(st.row, { onConflict: "category_id" });
    if (sErr) {
      await sb.from("categories").delete().eq("id", id);
      return NextResponse.json({ ok: false, error: sErr.message }, { status: 500 });
    }
    const a = await audit(sb, req, admin.userId, id, "create", null, { ...cat, settings: st.row });
    return NextResponse.json({ ok: true, id, ...(a.ok ? {} : { auditWarning: true }) });
  }

  if (op === "update") {
    const id = communityAdminUuidOrNull(body.id as string);
    if (!id) return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
    const { data: before } = await sb.from("categories").select("*").eq("id", id).maybeSingle();
    if (!before) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    const cat = pick(body.category, CATEGORY_COLUMNS);
    if (cat.parent_id && cat.parent_id === id) {
      return NextResponse.json({ ok: false, error: "invalid_parent" }, { status: 400 });
    }
    if (Object.keys(cat).length) {
      const { data, error } = await sb
        .from("categories")
        .update({ ...cat, updated_at: now })
        .eq("id", id)
        .select("id");
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
      if (!data || data.length === 0) return NextResponse.json({ ok: false, error: "not_saved" }, { status: 409 });
    }
    let settingsAfter: Record<string, unknown> | null = null;
    if (body.settings !== undefined) {
      const { data: prev } = await sb.from("category_settings").select("*").eq("category_id", id).maybeSingle();
      const st = settingsRow(id, { ...((prev as Record<string, unknown> | null) ?? {}), ...pick(body.settings, SETTINGS_COLUMNS) });
      if (!st.ok) return NextResponse.json({ ok: false, error: st.error }, { status: 400 });
      const { error } = await sb.from("category_settings").upsert(st.row, { onConflict: "category_id" });
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      settingsAfter = st.row;
    }
    const a = await audit(sb, req, admin.userId, id, "update", before, { ...cat, ...(settingsAfter ? { settings: settingsAfter } : {}) });
    return NextResponse.json({ ok: true, ...(a.ok ? {} : { auditWarning: true }) });
  }

  if (op === "delete") {
    const id = communityAdminUuidOrNull(body.id as string);
    if (!id) return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
    // R2 — 카테고리 삭제(delete L3)는 확인창 사유 필수 → 감사 after.reason.
    const reason = parseAdminReason(body.reason);
    if (!reason) return NextResponse.json({ ok: false, error: ADMIN_REASON_REQUIRED_CODE }, { status: 400 });
    const [{ data: before }, posts, children] = await Promise.all([
      sb.from("categories").select("*").eq("id", id).maybeSingle(),
      sb.from("posts").select("id", { count: "exact", head: true }).eq("trade_category_id", id),
      sb.from("categories").select("id", { count: "exact", head: true }).eq("parent_id", id),
    ]);
    if (!before) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    if (posts.error || children.error) return NextResponse.json({ ok: false, error: "count_failed" }, { status: 500 });
    if ((posts.count ?? 0) > 0 || (children.count ?? 0) > 0) {
      return NextResponse.json(
        { ok: false, error: "category_in_use", postCount: posts.count ?? 0, childCount: children.count ?? 0 },
        { status: 409 }
      );
    }
    // 감사 먼저 (삭제는 되돌릴 수 없음). 확인 뒤 글이 생기면 FK(posts.trade_category_id) 가 삭제를 막는다.
    const a = await audit(sb, req, admin.userId, id, "delete", before, { reason });
    if (!a.ok) return NextResponse.json({ ok: false, error: "audit_failed" }, { status: 500 });
    const { data, error } = await sb.from("categories").delete().eq("id", id).select("id");
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
    if (!data || data.length === 0) return NextResponse.json({ ok: false, error: "not_deleted" }, { status: 409 });
    return NextResponse.json({ ok: true });
  }

  if (op === "reorder") {
    const ids = Array.isArray(body.orderedIds) ? body.orderedIds.map((x) => communityAdminUuidOrNull(String(x))) : [];
    if (!ids.length || ids.some((x) => !x)) return NextResponse.json({ ok: false, error: "invalid_ids" }, { status: 400 });
    for (let i = 0; i < ids.length; i++) {
      const { data, error } = await sb
        .from("categories")
        .update({ sort_order: i, updated_at: now })
        .eq("id", ids[i] as string)
        .select("id");
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      if (!data || data.length === 0) return NextResponse.json({ ok: false, error: "not_saved", index: i }, { status: 409 });
    }
    const a = await audit(sb, req, admin.userId, "reorder", "reorder", null, { orderedIds: ids });
    return NextResponse.json({ ok: true, ...(a.ok ? {} : { auditWarning: true }) });
  }

  return NextResponse.json({ ok: false, error: "invalid_op" }, { status: 400 });
}
