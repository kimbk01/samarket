import { NextResponse } from "next/server";
import { requireChatAdmin } from "@/lib/admin/chat-admin/chat-admin-guards";
import { getMessengerMonitoringSummary } from "@/lib/community-messenger/monitoring/server-store-summary";
import { loadMessengerMonitoringDurableRollup } from "@/lib/community-messenger/monitoring/monitoring-rollup-read";
import { resolveServiceSupabaseForApi } from "@/lib/supabase/resolve-service-supabase-for-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireChatAdmin();
  if (!admin.ok) return admin.response;
  const summary = getMessengerMonitoringSummary();
  /** U1: 인스턴스 메모리와 별개로 DB 에 남은 최근 24시간 집계. 실패해도 기존 요약은 그대로 응답한다. */
  const durable = await loadMessengerMonitoringDurableRollup(resolveServiceSupabaseForApi()).catch(() => ({
    ok: false as const,
    error: "query_threw",
  }));
  return NextResponse.json({ ok: true, summary, durable });
}
