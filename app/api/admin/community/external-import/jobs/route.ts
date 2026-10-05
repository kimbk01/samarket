import { NextRequest } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import type { InboxKey } from "@/lib/community-operator-import/inbox-store";
import { createJob, JOB_KINDS, type JobKind, type JobParams, listRecentJobs, loadJob, runJobChunk } from "@/lib/community-operator-import/jobs";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = await requireAdminApiUser();
  if (!auth.ok) return auth.response;
  const sb = getSupabaseServer();
  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    const job = await loadJob(sb, id);
    return job ? jsonOk(job) : jsonError("작업 없음", 404, { code: "job_not_found" });
  }
  return jsonOk({ jobs: await listRecentJobs(sb) });
}

/**
 * {action:"create", kind, items, params} → creates the job and runs the first chunk
 * {action:"run", jobId}                    → continues pending items (time-boxed)
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdminApiUser();
  if (!auth.ok) return auth.response;
  const parsed = await parseJsonBody<{ action?: string; kind?: JobKind; items?: InboxKey[]; params?: JobParams; jobId?: string }>(
    req,
    "JSON 본문이 필요합니다.",
  );
  if (!parsed.ok) return parsed.response;
  const b = parsed.value;
  try {
    const sb = getSupabaseServer();
    if (b.action === "create") {
      if (!b.kind || !JOB_KINDS.includes(b.kind)) return jsonError("kind 오류", 400, { code: "invalid_job_kind" });
      const params: JobParams = {
        topicId: b.params?.topicId || null,
        topicSlug: b.params?.topicSlug || null,
        acceptPartial: b.params?.acceptPartial === true,
        contentPolicy: b.params?.contentPolicy || null,
      };
      const job = await createJob(sb, { kind: b.kind, items: Array.isArray(b.items) ? b.items : [], params, adminUserId: auth.userId });
      const after = await runJobChunk(sb, job.id, { budgetMs: 40_000, adminUserId: auth.userId });
      return jsonOk({ job: after });
    }
    if (b.action === "run") {
      if (!b.jobId) return jsonError("jobId 필요", 400, { code: "job_id_required" });
      return jsonOk({ job: await runJobChunk(sb, b.jobId, { budgetMs: 40_000, adminUserId: auth.userId }) });
    }
    return jsonError("지원 action: create | run", 400, { code: "unsupported_action" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "job_failed";
    return jsonError(msg, 400, { code: msg.split(":")[0] || "job_failed" });
  }
}
