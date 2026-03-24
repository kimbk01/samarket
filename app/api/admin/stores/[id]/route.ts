import { NextRequest, NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const dynamic = "force-dynamic";

type PatchBody = {
  action?: string;
  reason?: string;
  note?: string;
  /** action === set_owner_identity_editable */
  enabled?: boolean;
};

/**
 * 관리자 매장·판매권한 조치
 * action: approve_store | reject_store | request_revision | suspend_store | resume_store
 *         | set_owner_identity_editable (body.enabled: boolean)
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
    .select("id, approval_status")
    .eq("id", id)
    .maybeSingle();

  if (findErr || !store) {
    return NextResponse.json({ ok: false, error: "store_not_found" }, { status: 404 });
  }

  if (
    action === "approve_store" ||
    action === "reject_store" ||
    action === "request_revision" ||
    action === "suspend_store" ||
    action === "resume_store"
  ) {
    let patch: Record<string, unknown> = {};
    if (action === "approve_store") {
      patch = {
        approval_status: "approved",
        is_visible: true,
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
        is_visible: true,
        suspended_reason: null,
      };
    }

    const { error: upErr } = await sb.from("stores").update(patch).eq("id", id);
    if (upErr) {
      console.error("[admin/stores PATCH store]", upErr);
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
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
    return NextResponse.json({ ok: true });
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
      .update(permPatch)
      .eq("store_id", id);

    if (pErr) {
      console.error("[admin/stores PATCH sales]", pErr);
      return NextResponse.json({ ok: false, error: pErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 400 });
}
