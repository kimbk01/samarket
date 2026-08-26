import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { GIFT_TABLES } from "@/lib/gift-certificate/gift-certificate-schema";
import { getCachedStoreIfOwner } from "@/lib/stores/owner-store-ownership-cache";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APP_SELECT =
  "id, store_id, owner_user_id, title, requested_face_value, requested_purchase_price, image_url, status, design_notes, rejection_reason, created_at, updated_at";

/** GET+POST /api/me/stores/[storeId]/gift-certificates/applications */
export async function GET(
  _req: Request,
  context: { params: Promise<{ storeId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { storeId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  if (!sid) {
    return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const gate = await getCachedStoreIfOwner(sb, userId, sid);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }

  const { data, error } = await sb
    .from(GIFT_TABLES.applications)
    .select(APP_SELECT)
    .eq("store_id", sid)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, applications: data ?? [] });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ storeId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { storeId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  if (!sid) {
    return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const gate = await getCachedStoreIfOwner(sb, userId, sid);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const title = String(body.title ?? "").trim();
  const requestedFaceValue = Math.trunc(Number(body.requestedFaceValue ?? body.requested_face_value));
  const requestedPurchaseRaw = body.requestedPurchasePrice ?? body.requested_purchase_price;
  const requestedPurchasePrice =
    requestedPurchaseRaw == null || requestedPurchaseRaw === ""
      ? null
      : Math.trunc(Number(requestedPurchaseRaw));
  const designNotes = String(body.designNotes ?? body.design_notes ?? "").trim() || null;
  const imageUrl = String(body.imageUrl ?? body.image_url ?? "").trim() || null;
  const submit = body.submit === true || body.status === "submitted";
  const resubmitOf = String(body.resubmitOf ?? body.resubmit_of ?? "").trim();

  if (!title || !Number.isFinite(requestedFaceValue) || requestedFaceValue <= 0) {
    return NextResponse.json(
      { ok: false, error: "title_and_requested_face_value_required" },
      { status: 400 }
    );
  }
  if (
    requestedPurchasePrice != null &&
    (!Number.isFinite(requestedPurchasePrice) || requestedPurchasePrice < 0)
  ) {
    return NextResponse.json({ ok: false, error: "invalid_requested_purchase_price" }, { status: 400 });
  }

  const payload = {
    store_id: sid,
    owner_user_id: userId,
    title,
    requested_face_value: requestedFaceValue,
    requested_purchase_price: requestedPurchasePrice,
    status: submit ? "submitted" : "draft",
    design_notes: designNotes,
    image_url: imageUrl,
    rejection_reason: null as string | null,
    updated_at: new Date().toISOString(),
  };

  if (resubmitOf) {
    const { data: existing, error: exErr } = await sb
      .from(GIFT_TABLES.applications)
      .select("id, store_id, status")
      .eq("id", resubmitOf)
      .eq("store_id", sid)
      .maybeSingle();
    if (exErr || !existing) {
      return NextResponse.json({ ok: false, error: "application_not_found" }, { status: 404 });
    }
    if (String((existing as { status?: string }).status) !== "rejected") {
      return NextResponse.json({ ok: false, error: "only_rejected_can_resubmit" }, { status: 400 });
    }
    const { data, error } = await sb
      .from(GIFT_TABLES.applications)
      .update(payload)
      .eq("id", resubmitOf)
      .select(APP_SELECT)
      .single();
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, application: data });
  }

  const { data, error } = await sb
    .from(GIFT_TABLES.applications)
    .insert({
      ...payload,
      created_at: new Date().toISOString(),
    })
    .select(APP_SELECT)
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, application: data }, { status: 201 });
}
