import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { listAdminBusinessCashChargeRequests } from "@/lib/stores/advertising/delivery-ad-business-cash-charge-request";
import type { DeliveryAdCashChargeRequestStatus } from "@/lib/stores/advertising/delivery-ad-product-recovery-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/delivery-ads/business-cash/charge-requests?status=open|pending_deposit|… */
export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const statusRaw = req.nextUrl.searchParams.get("status")?.trim() ?? "open";
  const status =
    statusRaw === "open" ||
    statusRaw === "pending_deposit" ||
    statusRaw === "under_review" ||
    statusRaw === "completed" ||
    statusRaw === "rejected" ||
    statusRaw === "all"
      ? statusRaw
      : "open";

  const rows = await listAdminBusinessCashChargeRequests(
    sb,
    status === "all" ? undefined : (status as DeliveryAdCashChargeRequestStatus | "open")
  );
  return NextResponse.json({ ok: true, requests: rows });
}
