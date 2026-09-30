import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * R14-P6 FINAL: independent Live pointer mutation is retired.
 * Only canonical Service Apply (`…/apply-service`) may mutate Owner Live.
 */
export async function POST() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  return NextResponse.json(
    {
      ok: false as const,
      error: "live_set_retired",
      message:
        "Live 포인터만 따로 변경할 수 없습니다. Studio에서 저장한 뒤 「서비스 적용」으로만 적용하세요.",
    },
    { status: 409 },
  );
}
