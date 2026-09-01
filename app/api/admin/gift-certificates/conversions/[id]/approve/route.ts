import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/admin/gift-certificates/conversions/[id]/approve */
export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const requestId = typeof id === "string" ? id.trim() : "";
  if (!requestId) {
    return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  }

  return NextResponse.json(
    {
      ok: false,
      error: "historical_gift_conversion_read_only",
      message:
        "Historical gift conversion requests are read-only. Use canonical Coin finance.",
    },
    { status: 410 }
  );
}
