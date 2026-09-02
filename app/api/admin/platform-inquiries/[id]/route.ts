import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH /api/admin/platform-inquiries/[id] — A2-2: legacy write disabled. */
export async function PATCH(
  _req: NextRequest,
  _context: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  return NextResponse.json(
    {
      ok: false,
      error: "legacy_writer_disabled",
      message: "Use /admin/support for new admin support answers.",
    },
    { status: 410 }
  );
}
