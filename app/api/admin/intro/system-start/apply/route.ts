import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * R14-P6: separate System Start Live Apply is retired.
 * Service Apply must go through Studio saved Draft → apply-service
 * (ONE StartupPackageEnvelope + ONE Owner Live pointer).
 * Does not mutate OS Splash / LaunchScreen binaries.
 */
export async function POST() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  return NextResponse.json(
    {
      ok: false as const,
      error: "system_start_separate_apply_retired",
      message:
        "시스템 시작 화면만 따로 서비스 적용할 수 없습니다. 인트로 Studio에서 저장한 뒤 「서비스 적용」으로 System Start와 Intro를 함께 적용하세요.",
    },
    { status: 409 },
  );
}
