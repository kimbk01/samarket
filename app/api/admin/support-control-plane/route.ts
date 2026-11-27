import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { loadSupportControlPlane } from "@/lib/admin/support-control-plane/load-support-control-plane";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/support-control-plane — read-only Support/Notification composition. */
export async function GET() {
  // 고객 문의 최종 감사 D3: 문의·고객 첫 글·회원 id 를 읽으므로 다른 고객지원 API 와 같은 `support` 키
  const gate = await requireAdminPermission("support");
  if (!gate.ok) return gate.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  try {
    const model = await loadSupportControlPlane(sb);
    return NextResponse.json({ ok: true, plane: model });
  } catch (e) {
    // 최종 감사 L4: 오류 원문은 기록만
    console.error("[support-control-plane]", e);
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  }
}
