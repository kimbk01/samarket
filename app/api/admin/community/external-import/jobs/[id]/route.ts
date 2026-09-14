import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const STATUS_LABEL: Record<string, string> = {
  queued: "불러오는 중",
  running: "불러오는 중",
  completed: "불러오기 완료",
  failed: "불러오기 실패",
};

export async function GET(_req: NextRequest, ctx: Ctx) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const { id } = await ctx.params;
  const sb = getSupabaseServer();
  const { data: job } = await sb.from("external_import_jobs").select("*").eq("id", id).maybeSingle();
  if (!job) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  return NextResponse.json({
    ok: true,
    job: {
      id: job.id,
      action: job.action,
      status: job.status,
      statusLabel: STATUS_LABEL[job.status] || job.status,
      resultSummary: job.result_summary,
      errorMessage:
        job.status === "failed"
          ? "게시물을 불러오지 못했습니다."
          : null,
      createdAt: job.created_at,
      startedAt: job.started_at,
      completedAt: job.completed_at,
    },
  });
}
