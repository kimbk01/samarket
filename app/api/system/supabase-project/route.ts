import { NextResponse } from "next/server";
import { parseSupabasePublicUrl } from "@/lib/system/parse-supabase-public-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 로컬 vs 배포 로그인 불일치 진단: 동일 projectRef 인지 비교.
 * (URL은 이미 클라이언트에 노출되는 공개 값만 반환)
 */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) {
    return NextResponse.json({ ok: false, error: "missing_NEXT_PUBLIC_SUPABASE_URL" }, { status: 503 });
  }
  const parsed = parseSupabasePublicUrl(url);
  if (!parsed) {
    return NextResponse.json({ ok: false, error: "invalid_NEXT_PUBLIC_SUPABASE_URL" }, { status: 503 });
  }
  return NextResponse.json({
    ok: true,
    projectRef: parsed.projectRef,
    host: parsed.host,
  });
}
