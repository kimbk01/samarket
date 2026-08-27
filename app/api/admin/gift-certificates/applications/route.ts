import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import {
  adminGiftProfileLabel,
  loadAdminGiftProfileMap,
} from "@/lib/gift-certificate/admin-gift-ops-profile";
import { GIFT_TABLES } from "@/lib/gift-certificate/gift-certificate-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/gift-certificates/applications — Admin list for U1 review */
export async function GET(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;

  const status = new URL(req.url).searchParams.get("status")?.trim() || "";
  let q = gate.sb
    .from(GIFT_TABLES.applications)
    .select(
      "id, store_id, owner_user_id, title, requested_face_value, requested_purchase_price, image_url, status, design_notes, rejection_reason, created_at, updated_at, stores(store_name, slug)"
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (status) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const ownerIds = (data ?? []).map((raw) => String((raw as { owner_user_id?: string }).owner_user_id ?? ""));
  const profiles = await loadAdminGiftProfileMap(gate.sb, ownerIds);

  const applications = (data ?? []).map((raw) => {
    const row = raw as Record<string, unknown>;
    const storesRaw = row.stores;
    const storeObj = Array.isArray(storesRaw) ? storesRaw[0] : storesRaw;
    const storeName =
      storeObj && typeof storeObj === "object" && (storeObj as { store_name?: unknown }).store_name != null
        ? String((storeObj as { store_name: unknown }).store_name)
        : "";
    const ownerUserId = String(row.owner_user_id);
    return {
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
    };
  });

  return NextResponse.json({ ok: true, applications });
}
