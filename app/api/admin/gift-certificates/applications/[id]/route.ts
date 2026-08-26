import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { GIFT_TABLES } from "@/lib/gift-certificate/gift-certificate-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH /api/admin/gift-certificates/applications/[id] — approve/reject */
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

  const { data, error } = await gate.sb
    .from(GIFT_TABLES.applications)
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", appId)
    .select(
      "id, store_id, owner_user_id, title, requested_face_value, status, design_notes, created_at, updated_at"
    )
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ ok: false, error: "application_not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, application: data });
}
