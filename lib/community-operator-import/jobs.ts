/**
 * BULK JOBS (community_import_jobs / _items): publish · update · hide · unhide · reprocess.
 * Processed in time-boxed chunks under a lease, so a serverless timeout never leaves half-written
 * items: each item is its own transaction (publish RPC) and is marked done/failed individually.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchArticleForInbox } from "./collect";
import { defaultOperatorDraftEdit } from "./draft-apply";
import { carryEditToArticle, loadOperatorImportDraft } from "./draft-store";

import { type InboxKey, loadInboxRow } from "./inbox-store";
import { publishImportedArticle } from "./publish";
import { loadRules } from "./rules";
import type { ContentPolicy, OperatorDraftEdit } from "./types";

export const JOBS_TABLE = "community_import_jobs";
export const JOB_ITEMS_TABLE = "community_import_job_items";
export const JOB_KINDS = ["publish", "update", "hide", "unhide", "reprocess"] as const;
export type JobKind = (typeof JOB_KINDS)[number];
export const MAX_JOB_ITEMS = 200;

export type JobParams = {
  topicId?: string | null;
  topicSlug?: string | null;
  acceptPartial?: boolean;
  contentPolicy?: ContentPolicy | null;
};

export type JobSummary = {
  id: string;
  kind: JobKind;
  status: string;
  total: number;
  done: number;
  failed: number;
  skipped: number;
  createdAt: string;
  finishedAt: string | null;
  lastError: string | null;
};

function mapJob(r: Record<string, unknown>): JobSummary {
  return {
    id: String(r.id),
    kind: String(r.kind) as JobKind,
    status: String(r.status),
    total: Number(r.total) || 0,
    done: Number(r.done_count) || 0,
    failed: Number(r.failed_count) || 0,
    skipped: Number(r.skipped_count) || 0,
    createdAt: String(r.created_at || ""),
    finishedAt: (r.finished_at as string | null) || null,
    lastError: (r.last_error as string | null) || null,
  };
}

export async function createJob(
  sb: SupabaseClient,
  input: { kind: JobKind; items: InboxKey[]; params: JobParams; adminUserId: string },
): Promise<JobSummary> {
  if (!JOB_KINDS.includes(input.kind)) throw new Error("invalid_job_kind");
  const seen = new Set<string>();
  const items = input.items.filter((k) => {
    const id = `${k.sourceSite}|${k.sourceBoard}|${k.sourceArticleKey}`;
    if (!k.sourceSite || !k.sourceBoard || !k.sourceArticleKey || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  if (!items.length) throw new Error("no_items");
  if (items.length > MAX_JOB_ITEMS) throw new Error(`too_many_items:${MAX_JOB_ITEMS}`);
  const { data: job, error } = await sb
    .from(JOBS_TABLE)
    .insert({ kind: input.kind, status: "queued", params: input.params, total: items.length, created_by: input.adminUserId })
    .select("*")
    .single();
  if (error || !job) throw new Error(error?.message || "job_create_failed");
  const jobId = String((job as { id: string }).id);
  const { error: ie } = await sb.from(JOB_ITEMS_TABLE).insert(
    items.map((k) => ({
      job_id: jobId,
      source_site: k.sourceSite,
      source_board: k.sourceBoard,
      source_article_key: k.sourceArticleKey,
      status: "pending",
    })),
  );
  if (ie) {
    await sb.from(JOBS_TABLE).update({ status: "failed", last_error: ie.message, finished_at: new Date().toISOString() }).eq("id", jobId);
    throw new Error(`job_items_create_failed: ${ie.message}`);
  }
  return mapJob(job as Record<string, unknown>);
}

export async function loadJob(sb: SupabaseClient, jobId: string) {
  const [{ data: job }, { data: items }] = await Promise.all([
    sb.from(JOBS_TABLE).select("*").eq("id", jobId).maybeSingle(),
    sb.from(JOB_ITEMS_TABLE).select("*").eq("job_id", jobId).order("updated_at"),
  ]);
  if (!job) return null;
  return {
    job: mapJob(job as Record<string, unknown>),
    items: (items || []).map((r) => {
      const x = r as Record<string, unknown>;
      return {
        sourceSite: String(x.source_site),
        sourceBoard: String(x.source_board),
        sourceArticleKey: String(x.source_article_key),
        status: String(x.status),
        message: (x.message as string | null) || null,
        postId: (x.post_id as string | null) || null,
      };
    }),
  };
}

export async function listRecentJobs(sb: SupabaseClient, limit = 20): Promise<JobSummary[]> {
  const { data } = await sb.from(JOBS_TABLE).select("*").order("created_at", { ascending: false }).limit(limit);
  return (data || []).map((r) => mapJob(r as Record<string, unknown>));
}

type ItemOutcome = { status: "done" | "failed" | "skipped"; message: string | null; postId?: string | null };

async function processItem(
  sb: SupabaseClient,
  kind: JobKind,
  key: InboxKey,
  params: JobParams,
  adminUserId: string,
  rules: Awaited<ReturnType<typeof loadRules>>,
): Promise<ItemOutcome> {
  if (kind === "hide" || kind === "unhide") {
    const { data: link } = await sb
      .from("community_import_post_links")
      .select("post_id")
      .eq("source_site", key.sourceSite)
      .eq("source_board", key.sourceBoard)
      .eq("source_article_key", key.sourceArticleKey)
      .maybeSingle();
    const postId = (link as { post_id?: string } | null)?.post_id;
    if (!postId) return { status: "skipped", message: "not_published" };
    const { data, error } = await sb
      .from("community_posts")
      .update({ status: kind === "hide" ? "hidden" : "active" })
      .eq("id", postId)
      .eq("origin_kind", "imported")
      .select("id");
    if (error) return { status: "failed", message: error.message };
    return data?.length ? { status: "done", message: null, postId } : { status: "skipped", message: "post_not_imported" };
  }

  if (kind === "reprocess") {
    const { article } = await fetchArticleForInbox(sb, key);
    return { status: "done", message: `quality:${article.quality?.verdict ?? "?"}` };
  }

  // publish / update
  const inbox = await loadInboxRow(sb, key);
  if (!inbox) return { status: "failed", message: "inbox_row_not_found" };
  if (kind === "publish" && inbox.publishedPostId) return { status: "skipped", message: "already_published", postId: inbox.publishedPostId };
  if (kind === "update" && !inbox.publishedPostId) return { status: "skipped", message: "not_published" };

  const draft = await loadOperatorImportDraft(sb, key);
  const { article } = await fetchArticleForInbox(sb, key);
  let edit: OperatorDraftEdit = draft ? carryEditToArticle(draft.edit, draft.original, article) : defaultOperatorDraftEdit(article);
  if (params.topicId && params.topicSlug) edit = { ...edit, topicId: params.topicId, topicSlug: params.topicSlug };
  if (params.contentPolicy) edit = { ...edit, contentPolicy: params.contentPolicy };

  const res = await publishImportedArticle(sb, {
    article,
    edit,
    mode: kind === "update" ? "update" : "create",
    adminUserId,
    acceptPartial: Boolean(params.acceptPartial),
    rules,
  });
  if (!res.ok) return { status: res.code === "already_published" ? "skipped" : "failed", message: `${res.code}: ${res.message}` };
  return { status: "done", message: res.warnings.length ? res.warnings.join("; ").slice(0, 500) : null, postId: res.postId };
}

/** Run pending items until the budget is spent. Safe to call repeatedly / concurrently (lease). */
export async function runJobChunk(
  sb: SupabaseClient,
  jobId: string,
  opts: { budgetMs?: number; adminUserId: string },
): Promise<JobSummary> {
  const budget = Math.max(5_000, Math.min(50_000, opts.budgetMs ?? 40_000));
  const t0 = Date.now();
  const now = new Date();
  const { data: leased } = await sb
    .from(JOBS_TABLE)
    .update({ locked_until: new Date(now.getTime() + budget + 15_000).toISOString(), status: "running", started_at: now.toISOString() })
    .eq("id", jobId)
    .in("status", ["queued", "running"])
    .or(`locked_until.is.null,locked_until.lt.${now.toISOString()}`)
    .select("*");
  const job = leased?.[0] as Record<string, unknown> | undefined;
  if (!job) {
    const cur = await loadJob(sb, jobId);
    if (!cur) throw new Error("job_not_found");
    return cur.job;
  }
  const kind = String(job.kind) as JobKind;
  const params = (job.params || {}) as JobParams;
  const rules = kind === "publish" || kind === "update" ? await loadRules(sb) : [];

  let lastError: string | null = null;
  while (Date.now() - t0 < budget) {
    const { data: pending } = await sb
      .from(JOB_ITEMS_TABLE)
      .select("*")
      .eq("job_id", jobId)
      .eq("status", "pending")
      .limit(1);
    const item = pending?.[0] as Record<string, unknown> | undefined;
    if (!item) break;
    const key: InboxKey = {
      sourceSite: String(item.source_site),
      sourceBoard: String(item.source_board),
      sourceArticleKey: String(item.source_article_key),
    };
    let outcome: ItemOutcome;
    try {
      outcome = await processItem(sb, kind, key, params, opts.adminUserId, rules);
    } catch (e) {
      outcome = { status: "failed", message: e instanceof Error ? e.message : String(e) };
    }
    if (outcome.status === "failed") lastError = outcome.message;
    await sb
      .from(JOB_ITEMS_TABLE)
      .update({ status: outcome.status, message: outcome.message, post_id: outcome.postId ?? null, updated_at: new Date().toISOString() })
      .eq("id", String(item.id));
  }

  const { data: counts } = await sb.from(JOB_ITEMS_TABLE).select("status").eq("job_id", jobId);
  const c = { pending: 0, done: 0, failed: 0, skipped: 0 } as Record<string, number>;
  for (const r of counts || []) c[String((r as { status: string }).status)] = (c[String((r as { status: string }).status)] || 0) + 1;
  const finished = c.pending === 0;
  const { data: saved } = await sb
    .from(JOBS_TABLE)
    .update({
      done_count: c.done,
      failed_count: c.failed,
      skipped_count: c.skipped,
      status: finished ? (c.failed && !c.done ? "failed" : "done") : "running",
      finished_at: finished ? new Date().toISOString() : null,
      locked_until: null,
      last_error: lastError ?? (job.last_error as string | null) ?? null,
    })
    .eq("id", jobId)
    .select("*")
    .single();
  return mapJob((saved || job) as Record<string, unknown>);
}
