import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { executeGiftTransferTransition } from "@/lib/gift-certificate/execute-gift-transfer-transition";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/me/gift-certificates/transfers/[transferId]/cancel */
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

  const result = await executeGiftTransferTransition(sb, {
    kind: "cancel",
    actorUserId: userId,
    transferId: tid,
  });
  if (!result.ok) {
    const status = result.error === "mutation_projection_missing" ? 500 : 400;
    return NextResponse.json(
      { ok: false, error: result.error, ...(result.data ?? {}) },
      { status }
    );
  }

  return NextResponse.json({
    ok: true,
    transfer: result.transfer,
    message: result.message,
    idempotent: result.idempotent ?? false,
  });
}
