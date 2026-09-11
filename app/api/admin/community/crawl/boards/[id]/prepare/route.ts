import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { COMMUNITY_CRAWL_PREPARE_AVAILABLE } from "@/lib/community-crawler/crawl-ssot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Legacy STEP5 prepare — retired from product authority (V2-0).
 * Use POST .../test (preview) or POST .../crawl (REAL durable items).
 */
export async function POST(_req: Request, _ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  if (!COMMUNITY_CRAWL_PREPARE_AVAILABLE) {
    return NextResponse.json(
      {
        ok: false,
        error: "PREPARE_RETIRED",
        detail:
          "Prepare crawl is retired. Use TEST preview or REAL crawl on durable items — not a hidden second product path.",
      },
      { status: 410 }
    );
  }

  return NextResponse.json(
    { ok: false, error: "PREPARE_UNAVAILABLE" },
    { status: 501 }
  );
}
