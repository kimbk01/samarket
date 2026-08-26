import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { giftCertificateReject } from "@/lib/gift-certificate/gift-certificate-rpc";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/me/gift-certificates/transfers/[transferId]/reject */
export async function POST(
  _req: Request,
  context: { params: Promise<{ transferId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { transferId } = await context.params;
  const tid = typeof transferId === "string" ? transferId.trim() : "";
  if (!tid) {
    return NextResponse.json({ ok: false, error: "missing_transfer_id" }, { status: 400 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const result = await giftCertificateReject(sb, {
    recipientUserId: userId,
    transferId: tid,
  });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, ...(result.data ?? {}) },
      { status: 400 }
    );
  }
  return NextResponse.json({ ok: true, ...result.data });
}
