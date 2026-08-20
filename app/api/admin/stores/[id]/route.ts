import { NextRequest, NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PatchBody = {
  action?: string;
  reason?: string;
  note?: string;
  memo?: string;
  /** action === set_owner_identity_editable */
  enabled?: boolean;
  /** action === set_store_name */
  store_name?: string;
};

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { id: storeId } = await context.params;
  const id = typeof storeId === "string" ? storeId.trim() : "";
  if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const { data: store, error } = await sb
    .from("stores")
    .select(
      "*, store_categories ( name, name_en, slug ), store_topics ( name, name_en, slug )"
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !store) {
    return NextResponse.json({ ok: false, error: "store_not_found" }, { status: 404 });
  }

  const ownerId = String((store as { owner_user_id?: string }).owner_user_id ?? "");
  let ownerNickname = "";
  if (ownerId) {
    const { data: prof } = await sb
      .from("profiles")
      .select("display_name, nickname, username")
      .eq("id", ownerId)
      .maybeSingle();
    if (prof) {
      const display = String((prof as { display_name?: string }).display_name ?? (prof as { nickname?: string }).nickname ?? "");
      const username = String((prof as { username?: string }).username ?? "");
      ownerNickname = display || username || ownerId.slice(0, 8);
    }
  }

  const { data: auditRows } = await sb
    .from("audit_logs")
    .select("id, action, actor_id, created_at, after_json")
    .eq("target_type", "store")
    .eq("target_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

  return NextResponse.json({
    ok: true,
    store,
    ownerNickname,
    logs: (auditRows ?? []).map((r: Record<string, unknown>) => ({
      id: String(r.id ?? ""),
      actionType: String(r.action ?? ""),
      adminId: String(r.actor_id ?? ""),
      note: r.after_json ? JSON.stringify(r.after_json).slice(0, 200) : "",
      createdAt: String(r.created_at ?? ""),
    })),
  });
}

/**
 * 관리자 매장·판매권한 조치
 * action: start_review | approve_store | reject_store | request_revision | suspend_store | resume_store
 *         | set_owner_identity_editable (body.enabled: boolean)
 *         | set_store_visible (body.enabled: boolean — 승인 매장만)
 *         | approve_sales | reject_sales | suspend_sales
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { id: storeId } = await context.params;
  const id = typeof storeId === "string" ? storeId.trim() : "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const action = String(body.action ?? "").trim();
  const reason = String(body.reason ?? body.note ?? "").trim() || null;

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data: store, error: findErr } = await sb
    .from("stores")
    .select("id, approval_status, is_visible")
    .eq("id", id)
    .maybeSingle();

  if (findErr || !store) {
    return NextResponse.json({ ok: false, error: "store_not_found" }, { status: 404 });
  }


  const auditOk = async (extra?: Record<string, unknown>) => {
    await appendAuditLog(sb, {
      actor_type: "admin",
      actor_id: null,
      target_type: "store",
      target_id: id,
      action: `store.${action}`,
      after_json: { action, reason, ...(extra ?? {}) },
    });
    return NextResponse.json({ ok: true });
  };

  if (
    action === "approve_store" ||
    action === "start_review" ||
    action === "mark_under_review" ||
    action === "reject_store" ||
    action === "request_revision" ||
    action === "suspend_store" ||
    action === "resume_store"
  ) {
    let patch: Record<string, unknown> = {};
    if (action === "start_review" || action === "mark_under_review") {
      patch = {
        approval_status: "under_review",
      };
    } else if (action === "approve_store") {
      patch = {
        approval_status: "approved",
        // 승인 직후 기본은 "비노출"로 시작 (상품/프로필 준비 후 오너가 켜도록)
        is_visible: false,
        approved_at: new Date().toISOString(),
        rejected_reason: null,
        revision_note: null,
        suspended_reason: null,
      };
    } else if (action === "reject_store") {
      patch = {
        approval_status: "rejected",
        is_visible: false,
        rejected_reason: reason,
        revision_note: null,
      };
    } else if (action === "request_revision") {
      patch = {
        approval_status: "revision_requested",
        revision_note: reason,
      };
    } else if (action === "suspend_store") {
      patch = {
        approval_status: "suspended",
        is_visible: false,
        suspended_reason: reason,
      };
    } else if (action === "resume_store") {
      patch = {
        approval_status: "approved",
        suspended_reason: null,
      };
    }

    const { error: upErr } = await sb.from("stores").update(patch).eq("id", id);
    if (upErr) {
      console.error("[admin/stores PATCH store]", upErr);
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    }
    return auditOk();
  }

  if (action === "set_owner_identity_editable") {
    const enabled = Boolean(body.enabled);
    const { error: idErr } = await sb
      .from("stores")
      .update({ owner_can_edit_store_identity: enabled })
      .eq("id", id);
    if (idErr) {
      console.error("[admin/stores PATCH identity flag]", idErr);
      return NextResponse.json({ ok: false, error: idErr.message }, { status: 500 });
    }
    return auditOk();
  }

  if (action === "set_store_visible") {
    if (store.approval_status !== "approved") {
      return NextResponse.json(
        { ok: false, error: "store_not_approved_for_visibility" },
        { status: 400 }
      );
    }
    const visible = Boolean(body.enabled);
    const { error: visErr } = await sb.from("stores").update({ is_visible: visible }).eq("id", id);
    if (visErr) {
      console.error("[admin/stores PATCH is_visible]", visErr);
      return NextResponse.json({ ok: false, error: visErr.message }, { status: 500 });
    }
    return auditOk();
  }

  if (action === "set_admin_memo") {
    const memo = String(body.memo ?? body.note ?? "").trim().slice(0, 2000);
    const { error: memoErr } = await sb.from("stores").update({ admin_internal_memo: memo }).eq("id", id);
    if (memoErr) {
      if (/admin_internal_memo|does not exist/i.test(memoErr.message)) {
        return NextResponse.json({ ok: false, error: "migration_required" }, { status: 503 });
      }
      return NextResponse.json({ ok: false, error: memoErr.message }, { status: 500 });
    }
    return auditOk();
  }

  if (action === "set_store_name") {
    const name = String(body.store_name ?? "").trim();
    if (!name || name.length < 2) {
      return NextResponse.json({ ok: false, error: "store_name_required" }, { status: 400 });
    }
    const { error: upErr } = await sb.from("stores").update({ store_name: name }).eq("id", id);
    if (upErr) {
      console.error("[admin/stores PATCH store_name]", upErr);
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    }
    return auditOk();
  }

  if (action === "approve_sales" || action === "reject_sales" || action === "suspend_sales") {
    if (store.approval_status !== "approved") {
      return NextResponse.json(
        { ok: false, error: "store_not_approved_for_sales" },
        { status: 400 }
      );
    }

    let permPatch: Record<string, unknown> = {};
    if (action === "approve_sales") {
      permPatch = {
        allowed_to_sell: true,
        sales_status: "approved",
        approved_at: new Date().toISOString(),
        rejection_reason: null,
        suspension_reason: null,
      };
    } else if (action === "reject_sales") {
      permPatch = {
        allowed_to_sell: false,
        sales_status: "rejected",
        rejection_reason: reason,
      };
    } else {
      permPatch = {
        allowed_to_sell: false,
        sales_status: "suspended",
        suspension_reason: reason,
      };
    }

    const { error: pErr } = await sb
      .from("store_sales_permissions")
      .upsert({ store_id: id, ...permPatch }, { onConflict: "store_id" });

    if (pErr) {
      console.error("[admin/stores PATCH sales]", pErr);
      return NextResponse.json({ ok: false, error: pErr.message }, { status: 500 });
    }
    return auditOk();
  }

  return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 400 });
}
