import { requireCommunityAdmin } from "@/lib/admin/community-admin/community-admin-guards";
import { appendCommunityAdminAudit } from "@/lib/admin/community-admin/community-admin-audit";
import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import type { InboxKey } from "@/lib/community-operator-import/inbox-store";
import {
  type AuthorMode,
  cancelJob,
  createJob,
  type DateMode,
  JOB_KINDS,
  type JobKind,
  type JobParams,
  listRecentJobs,
  loadJob,
  retryFailedItems,
  runJobChunk,
} from "@/lib/community-operator-import/jobs";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/http/api-route";
import { ADMIN_REASON_REQUIRED_CODE, parseAdminReason } from "@/lib/admin/operator-ux/admin-reason";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const AUTHOR_MODES: AuthorMode[] = ["keep", "original", "source", "custom"];
const DATE_MODES: DateMode[] = ["keep", "original", "publish"];

export async function GET(req: NextRequest) {
  const auth = await requireCommunityAdmin("content");
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
 * {action:"create", kind, items, params, reason} → creates the job and runs the first chunk
 *   — 게시·업데이트·숨김·다시 공개는 일괄 변경(bulk · L3)이라 사유 필수 → 감사 `after.reason`. 재수집(reprocess)은 사유 선택.
 * {action:"run", jobId}                    → continues pending items (time-boxed)
 */
export async function POST(req: NextRequest) {
  const auth = await requireCommunityAdmin("content");
  if (!auth.ok) return auth.response;
  const parsed = await parseJsonBody<{
    action?: string;
    kind?: JobKind;
    items?: InboxKey[];
    params?: JobParams;
    jobId?: string;
    reason?: unknown;
  }>(
    req,
    "JSON 본문이 필요합니다.",
  );
  if (!parsed.ok) return parsed.response;
  const b = parsed.value;
  try {
    const sb = getSupabaseServer();
    if (b.action === "create") {
      if (!b.kind || !JOB_KINDS.includes(b.kind)) return jsonError("kind 오류", 400, { code: "invalid_job_kind" });
      const reason = parseAdminReason(b.reason);
      if (b.kind !== "reprocess" && !reason) {
        return jsonError(ADMIN_REASON_REQUIRED_CODE, 400, { code: ADMIN_REASON_REQUIRED_CODE });
      }
      const p = b.params ?? {};
      const params: JobParams = {
        topicId: p.topicId || null,
        topicSlug: p.topicSlug || null,
        acceptPartial: p.acceptPartial === true,
        contentPolicy: p.contentPolicy || null,
        showAttribution: p.showAttribution === true || p.showAttribution === false ? p.showAttribution : null,
        authorMode: p.authorMode && AUTHOR_MODES.includes(p.authorMode) ? p.authorMode : null,
        customAuthor: typeof p.customAuthor === "string" ? p.customAuthor.trim().slice(0, 60) : null,
        dateMode: p.dateMode && DATE_MODES.includes(p.dateMode) ? p.dateMode : null,
        shuffle: p.shuffle === true,
        schedule: p.schedule?.mode === "spread" ? { mode: "spread", startAt: p.schedule.startAt ?? null, intervalMinutes: p.schedule.intervalMinutes ?? null } : null,
      };
      if (params.authorMode === "custom" && !params.customAuthor) return jsonError("표시 작성자를 입력하세요.", 400, { code: "custom_author_required" });
      const job = await createJob(sb, { kind: b.kind, items: Array.isArray(b.items) ? b.items : [], params, adminUserId: auth.userId });
      const audit = await appendCommunityAdminAudit(sb, req, {
        actorId: auth.userId,
        targetType: "community_import_job",
        targetId: String(job.id),
        action: "community_import.job_create",
        reason,
        before: null,
        after: {
          kind: b.kind,
          item_count: Array.isArray(b.items) ? b.items.length : 0,
          params: params as unknown as Record<string, unknown>,
        },
      });
      const after = await runJobChunk(sb, job.id, { budgetMs: 40_000, adminUserId: auth.userId });
      return jsonOk({ job: after, ...(audit.ok ? {} : { audit_warning: "audit_failed" }) });
    }
    if (b.action === "run") {
      if (!b.jobId) return jsonError("jobId 필요", 400, { code: "job_id_required" });
      return jsonOk({ job: await runJobChunk(sb, b.jobId, { budgetMs: 40_000, adminUserId: auth.userId }) });
    }
    if (b.action === "retry_failed") {
      if (!b.jobId) return jsonError("jobId 필요", 400, { code: "job_id_required" });
      const n = await retryFailedItems(sb, b.jobId);
      if (!n) return jsonError("다시 시도할 실패 항목이 없습니다.", 400, { code: "no_failed_items" });
      const audit = await appendCommunityAdminAudit(sb, req, {
        actorId: auth.userId,
        targetType: "community_import_job",
        targetId: b.jobId,
        action: "community_import.job_retry_failed",
        before: { failed_items: n },
        after: { retried: n },
      });
      return jsonOk({
        retried: n,
        job: await runJobChunk(sb, b.jobId, { budgetMs: 40_000, adminUserId: auth.userId }),
        ...(audit.ok ? {} : { audit_warning: "audit_failed" }),
      });
    }
    if (b.action === "cancel") {
      if (!b.jobId) return jsonError("jobId 필요", 400, { code: "job_id_required" });
      const prevJob = await loadJob(sb, b.jobId);
      await cancelJob(sb, b.jobId);
      const cur = await loadJob(sb, b.jobId);
      const audit = await appendCommunityAdminAudit(sb, req, {
        actorId: auth.userId,
        targetType: "community_import_job",
        targetId: b.jobId,
        action: "community_import.job_cancel",
        before: { status: (prevJob?.job as { status?: unknown } | undefined)?.status ?? null },
        after: { status: (cur?.job as { status?: unknown } | undefined)?.status ?? null },
      });
      return jsonOk({ job: cur?.job ?? null, ...(audit.ok ? {} : { audit_warning: "audit_failed" }) });
    }
    return jsonError("지원 action: create | run | retry_failed | cancel", 400, { code: "unsupported_action" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "job_failed";
    return jsonError(msg, 400, { code: msg.split(":")[0] || "job_failed" });
  }
}
