import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * R14-P6 FINAL: standalone Publish is retired as a product Live path.
 * Release + Package + Live promotion happen only via Service Apply.
 * `publishIntroDocument` remains an internal step of apply-service only.
 */
export async function POST() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  return NextResponse.json(
    {
      ok: false as const,
      error: "standalone_publish_retired",
      message:
        "별도 Publish는 더 이상 사용할 수 없습니다. Studio에서 저장한 뒤 「서비스 적용」으로 Release와 Live를 함께 적용하세요.",
    },
    { status: 409 },
  );
}
