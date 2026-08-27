import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import {
  adminGiftProfileLabel,
  loadAdminGiftProfileMap,
} from "@/lib/gift-certificate/admin-gift-ops-profile";
import { GIFT_TABLES } from "@/lib/gift-certificate/gift-certificate-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APP_SELECT =
  "id, store_id, owner_user_id, title, requested_face_value, requested_purchase_price, image_url, status, design_notes, rejection_reason, created_at, updated_at";

/** GET /api/admin/gift-certificates/applications/[id] */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const appId = typeof id === "string" ? id.trim() : "";
  if (!appId) {
    return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  }

  const { data, error } = await gate.sb
    .from(GIFT_TABLES.applications)
    .select(`${APP_SELECT}, stores(store_name, slug)`)
    .eq("id", appId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ ok: false, error: "application_not_found" }, { status: 404 });
  }

  const row = data as Record<string, unknown>;
  const storesRaw = row.stores;
  const storeObj = Array.isArray(storesRaw) ? storesRaw[0] : storesRaw;
  const storeName =
    storeObj && typeof storeObj === "object" && (storeObj as { store_name?: unknown }).store_name != null
      ? String((storeObj as { store_name: unknown }).store_name)
      : "";
  const ownerUserId = String(row.owner_user_id);
  const profiles = await loadAdminGiftProfileMap(gate.sb, [ownerUserId]);

  return NextResponse.json({
    ok: true,
    application: {
      id: String(row.id),
      store_id: String(row.store_id),
      store_name: storeName,
      owner_user_id: ownerUserId,
      owner_label: adminGiftProfileLabel(profiles.get(ownerUserId)),
      title: String(row.title ?? ""),

      requested_face_value: Math.trunc(Number(row.requested_face_value) || 0),
      requested_purchase_price:
        row.requested_purchase_price == null
          ? null
          : Math.trunc(Number(row.requested_purchase_price) || 0),
      image_url: row.image_url == null ? null : String(row.image_url),
      status: String(row.status ?? ""),
      design_notes: row.design_notes == null ? null : String(row.design_notes),
      rejection_reason: row.rejection_reason == null ? null : String(row.rejection_reason),
      created_at: String(row.created_at ?? ""),
      updated_at: String(row.updated_at ?? ""),
    },
  });
}

/** PATCH /api/admin/gift-certificates/applications/[id] — approve/reject/under_review */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const appId = typeof id === "string" ? id.trim() : "";
  if (!appId) {
    return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const action = String(body.action ?? body.status ?? "").trim().toLowerCase();
  let status: "approved" | "rejected" | "under_review" | null = null;
  if (action === "approve" || action === "approved") status = "approved";
  else if (action === "reject" || action === "rejected") status = "rejected";
  else if (action === "under_review" || action === "review") status = "under_review";
  if (!status) {
    return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
  }

  const rejectionReason = String(body.rejectionReason ?? body.rejection_reason ?? "").trim();
  if (status === "rejected" && !rejectionReason) {
    return NextResponse.json({ ok: false, error: "rejection_reason_required" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
    rejection_reason: status === "rejected" ? rejectionReason : null,
  };

  const { data, error } = await gate.sb
    .from(GIFT_TABLES.applications)
    .update(patch)
    .eq("id", appId)
    .select(APP_SELECT)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ ok: false, error: "application_not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, application: data });
}
