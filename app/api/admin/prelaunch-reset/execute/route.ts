import { NextResponse } from "next/server";
import {
  PRELAUNCH_RESET_LEGACY_API_GONE_BODY,
  PRELAUNCH_RESET_LEGACY_API_GONE_STATUS,
} from "@/lib/admin/prelaunch-reset/legacy-api-retired";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/prelaunch-reset/execute — RETIRED (P0).
 * Always 410 before auth, body parsing or any database access.
 * Use the Data Reset engine at /admin/system/data-reset.
 */
export async function POST() {
  return NextResponse.json(PRELAUNCH_RESET_LEGACY_API_GONE_BODY, {
    status: PRELAUNCH_RESET_LEGACY_API_GONE_STATUS,
  });
}
