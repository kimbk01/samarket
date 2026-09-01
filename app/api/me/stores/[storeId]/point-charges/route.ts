import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function removed() {
  return NextResponse.json(
    { ok: false, error: "historical_store_credit_product_removed" },
    { status: 410 }
  );
}

export const GET = removed;
export const POST = removed;
