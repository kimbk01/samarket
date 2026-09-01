import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function removed() {
  return NextResponse.json(
    { ok: false, error: "parallel_gift_cash_out_removed_use_coin_withdrawal" },
    { status: 410 }
  );
}

export const GET = removed;
export const POST = removed;
