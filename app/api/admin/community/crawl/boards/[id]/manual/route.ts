import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { COMMUNITY_CRAWL_CORE_UNAVAILABLE_REASON } from "@/lib/community-crawler/crawl-ssot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** STEP2: MANUAL crawl placeholder — no fetch / no mock success. */
export async function POST() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  return NextResponse.json(
    {
      ok: false,
      error: COMMUNITY_CRAWL_CORE_UNAVAILABLE_REASON,
      message: "Manual crawl is not available until crawler core is implemented.",
    },
    { status: 501 }
  );
}
