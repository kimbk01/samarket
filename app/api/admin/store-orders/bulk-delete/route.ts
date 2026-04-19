/**
 * POST /api/admin/store-orders/bulk-delete
 * 관리자: store_orders 영구 삭제 (품목·정산·리뷰·주문채팅방 등 CASCADE, 결제 원장은 선삭제)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BATCH = 50;

function parseOrderIds(body: unknown): string[] | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as { orderIds?: unknown }).orderIds;
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== "string") continue;
    const id = x.trim();
    if (id) out.push(id);
  }
  return out.length ? out : null;
}

export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON 본문이 필요합니다." }, { status: 400 });
  }

  const ids = parseOrderIds(json);
  if (!ids) {
    return NextResponse.json({ ok: false, error: "orderIds: string[] 가 필요합니다." }, { status: 400 });
  }
  if (ids.length > MAX_BATCH) {
    return NextResponse.json(
      { ok: false, error: `한 번에 최대 ${MAX_BATCH}건까지 삭제할 수 있습니다.` },
      { status: 400 }
    );
  }

  const unique = [...new Set(ids)];
  const deleted: string[] = [];
  const errors: { id: string; message: string }[] = [];

  const { error: payErr } = await sb.from("store_payments").delete().in("order_id", unique);
  if (payErr) {
    console.error("[admin store-orders bulk-delete] store_payments", payErr);
  }

  const { data: delRows, error: ordErr } = await sb.from("store_orders").delete().in("id", unique).select("id");
  if (ordErr) {
    for (const id of unique) {
      const { error: p2 } = await sb.from("store_payments").delete().eq("order_id", id);
      if (p2) console.error("[admin store-orders bulk-delete] payment row", id, p2);
      const { data: one, error: o2 } = await sb.from("store_orders").delete().eq("id", id).select("id").maybeSingle();
      if (o2) {
        errors.push({ id, message: o2.message });
      } else if (one?.id) {
        deleted.push(one.id as string);
      }
    }
  } else {
    for (const row of delRows ?? []) {
      const id = row.id as string;
      if (id) deleted.push(id);
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    deleted,
    errors: errors.length ? errors : undefined,
  });
}
