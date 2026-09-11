import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Legacy MANUAL crawl placeholder — retired. Use .../crawl (runCommunityCrawlBoard). */
export async function POST() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  return NextResponse.json(
    {
      ok: false,
      error: "MANUAL_CRAWL_RETIRED",
      message: "Use POST .../crawl (canonical runCommunityCrawlBoard).",
    },
    { status: 410 }
  );
}
