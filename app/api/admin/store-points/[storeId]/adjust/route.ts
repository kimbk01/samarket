import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Historical store-credit balances are immutable after cutover. */
export async function POST(
  _req: Request,
  _context: { params: Promise<{ storeId: string }> }
) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  return NextResponse.json(
    { ok: false, error: "historical_store_credit_read_only" },
    { status: 410 }
  );
}
