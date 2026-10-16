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
import { loadManagedSource } from "./source-store";
import type { ContentPolicy, OperatorDraftEdit, OperatorNormalizedArticle } from "./types";

export const JOBS_TABLE = "community_import_jobs";
export const JOB_ITEMS_TABLE = "community_import_job_items";
export const JOB_KINDS = ["publish", "update", "hide", "unhide", "reprocess"] as const;
export type JobKind = (typeof JOB_KINDS)[number];
export const MAX_JOB_ITEMS = 200;

/** Bulk override of the displayed author. `keep` = each article's draft value. */
export type AuthorMode = "keep" | "original" | "source" | "custom";
/** Bulk override of the displayed date. `keep` = each article's draft value. */
export type DateMode = "keep" | "original" | "publish";

export type JobSchedule = {
  /** `now`: publish as fast as possible · `spread`: one item every `intervalMinutes` from `startAt`. */
  mode: "now" | "spread";
  startAt?: string | null;
  intervalMinutes?: number | null;
};

export type JobParams = {
  topicId?: string | null;
  topicSlug?: string | null;
  acceptPartial?: boolean;
  contentPolicy?: ContentPolicy | null;
  /** null = keep each article's own setting. */
  showAttribution?: boolean | null;
  authorMode?: AuthorMode | null;
  customAuthor?: string | null;
  dateMode?: DateMode | null;
  /** Publish order is shuffled so one source never runs in a row (see `interleaveShuffle`). */
  shuffle?: boolean;
  schedule?: JobSchedule | null;
  /** Item keys (`site|board|key`) in publish order — written at creation. */
  order?: string[];
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
  /** Spread jobs: when the next pending item becomes due (null = due now / nothing pending). */
  nextDueAt: string | null;
};

export const SPREAD_MIN_INTERVAL = 5;
export const SPREAD_MAX_INTERVAL = 24 * 60;

const itemId = (k: InboxKey) => `${k.sourceSite}|${k.sourceBoard}|${k.sourceArticleKey}`;

/**
 * Can `counts` still be laid out with no two equal neighbours, given the next item may not be `prev`?
 * The largest group needs enough others between its items.
 */
function arrangeable(counts: Map<string, number>, prev: string | null): boolean {
  let total = 0;
  let maxG: string | null = null;
  let max = 0;
  for (const [g, n] of counts) {
    total += n;
    if (n > max) {
      max = n;
      maxG = g;
    }
  }
  if (!total) return true;
  const others = total - max;
  return maxG === prev ? max <= others : max <= others + 1;
}

/**
 * Random order where the same source never appears twice in a row when it can be avoided:
 * each step picks randomly among the sources that keep the rest arrangeable.
 * Pure; `rand` is injectable for tests.
 */
export function interleaveShuffle<T>(items: T[], groupOf: (t: T) => string, rand: () => number = Math.random): T[] {
  const groups = new Map<string, T[]>();
  for (const it of items) {
    const g = groupOf(it);
    const list = groups.get(g) ?? [];
    list.push(it);
    groups.set(g, list);
  }
  for (const list of groups.values()) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [list[i], list[j]] = [list[j]!, list[i]!];
    }
  }
  const out: T[] = [];
  let prev: string | null = null;
  while (out.length < items.length) {
    const open = [...groups.entries()].filter(([, l]) => l.length > 0);
    const counts = new Map(open.map(([g, l]) => [g, l.length]));
    const safe = open.filter(([g]) => {
      if (g === prev) return false;
      counts.set(g, counts.get(g)! - 1);
      const ok = arrangeable(counts, g);
      counts.set(g, counts.get(g)! + 1);
      return ok;
    });
    const notPrev = open.filter(([g]) => g !== prev);
    // No safe choice = adjacency is unavoidable (e.g. one source only); just avoid `prev` if possible.
    const pool = safe.length ? safe : notPrev.length ? notPrev : open;
    const [g, list] = pool[Math.floor(rand() * pool.length)]!;
    out.push(list.shift()!);
    prev = g;
  }
  return out;
}

/** When item #index of a spread job is due (ms). `now` mode → always due. Pure. */
export function itemDueAt(schedule: JobSchedule | null | undefined, index: number, createdAt: string): number {
  if (!schedule || schedule.mode !== "spread") return 0;
  const start = Date.parse(String(schedule.startAt || "")) || Date.parse(createdAt) || 0;
  const interval = Math.max(SPREAD_MIN_INTERVAL, Math.min(SPREAD_MAX_INTERVAL, Number(schedule.intervalMinutes) || 60));
  return start + index * interval * 60_000;
}

function mapJob(r: Record<string, unknown>, nextDueAt: string | null = null): JobSummary {
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
    nextDueAt,
  };
}

export function normalizeSchedule(s: JobSchedule | null | undefined): JobSchedule | null {
  if (!s || s.mode !== "spread") return null;
  const start = Date.parse(String(s.startAt || ""));
  const interval = Math.round(Number(s.intervalMinutes) || 60);
  if (interval < SPREAD_MIN_INTERVAL || interval > SPREAD_MAX_INTERVAL) throw new Error("invalid_spread_interval");
  return { mode: "spread", startAt: Number.isNaN(start) ? new Date().toISOString() : new Date(start).toISOString(), intervalMinutes: interval };
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
  const ordered = input.params.shuffle ? interleaveShuffle(items, (k) => k.sourceSite) : items;
  const params: JobParams = { ...input.params, order: ordered.map(itemId), schedule: normalizeSchedule(input.params.schedule) };
  const { data: job, error } = await sb
    .from(JOBS_TABLE)
    .insert({ kind: input.kind, status: "queued", params, total: items.length, created_by: input.adminUserId })
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

/** Bulk 작성자 · 날짜 · 출처 표시 overrides on top of each article's draft (pure except the source name lookup). */
export function applyBulkDisplayPure(
  edit: OperatorDraftEdit,
  article: OperatorNormalizedArticle,
  params: JobParams,
  sourceName: string,
): OperatorDraftEdit {
  let next = { ...edit };
  if (params.showAttribution === true || params.showAttribution === false) next.showAttribution = params.showAttribution;
  switch (params.authorMode) {
    case "original":
      next.displayAuthor = article.author || "";
      break;
    case "source":
      next.displayAuthor = sourceName;
      break;
    case "custom": {
      const name = String(params.customAuthor || "").trim().slice(0, 60);
      if (name) next.displayAuthor = name;
      break;
    }
    default:
      break;
  }
  if (params.dateMode === "original") next = { ...next, dateMode: "original", displayDate: defaultOperatorDraftEdit(article).displayDate };
  else if (params.dateMode === "publish") next = { ...next, dateMode: "publish" };
  return next;
}

async function applyBulkDisplay(
  sb: SupabaseClient,
  edit: OperatorDraftEdit,
  article: OperatorNormalizedArticle,
  params: JobParams,
): Promise<OperatorDraftEdit> {
  const sourceName = params.authorMode === "source" ? (await loadManagedSource(sb, article.sourceSite))?.displayName || article.sourceSite : "";
  return applyBulkDisplayPure(edit, article, params, sourceName);
}

type ItemOutcome ={ status: "done" | "failed" | "skipped"; message: string | null; postId?: string | null };

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
  edit = await applyBulkDisplay(sb, edit, article, params);

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
  const createdAt = String(job.created_at || "");
  const rules = kind === "publish" || kind === "update" ? await loadRules(sb) : [];

  let lastError: string | null = null;
  let nextDueAt: string | null = null;
  while (Date.now() - t0 < budget) {
    const { data: pending } = await sb.from(JOB_ITEMS_TABLE).select("*").eq("job_id", jobId).eq("status", "pending").limit(MAX_JOB_ITEMS);
    const free = ((pending ?? []) as Record<string, unknown>[]).filter((r) => !isClaimFresh(r, Date.now()));
    const next = pickNextItem(free, params, createdAt);
    if (!next) break;
    if (next.dueAt > Date.now()) {
      nextDueAt = new Date(next.dueAt).toISOString();
      break;
    }
    const item = next.item;
    // Another runner (a chunk that outlived its lease, or the cron) may hold this item: claim it atomically.
    if (!(await claimItem(sb, String(item.id), String(item.updated_at || "")))) continue;
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
  // A cancel that landed while this chunk ran keeps its status (counts are still refreshed).
  const { data: cancelled } = await sb.from(JOBS_TABLE).select("status").eq("id", jobId).eq("status", "cancelled").maybeSingle();
  if (cancelled) {
    const { data: kept } = await sb
      .from(JOBS_TABLE)
      .update({ done_count: c.done, failed_count: c.failed, skipped_count: c.skipped, locked_until: null })
      .eq("id", jobId)
      .select("*")
      .single();
    return mapJob((kept || job) as Record<string, unknown>);
  }
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
    .neq("status", "cancelled")
    .select("*")
    .maybeSingle();
  return mapJob((saved || job) as Record<string, unknown>, finished ? null : nextDueAt);
}

const CLAIM_MESSAGE = "processing";
/** A claim older than this is from a runner that died mid-item; the item may be taken again. */
export const CLAIM_STALE_MS = 10 * 60_000;

/** Pending item currently claimed by a live runner. Pure. */
export function isClaimFresh(r: Record<string, unknown>, now: number): boolean {
  if (r.message !== CLAIM_MESSAGE) return false;
  const at = Date.parse(String(r.updated_at || ""));
  return !Number.isNaN(at) && now - at < CLAIM_STALE_MS;
}

/**
 * Compare-and-set on (status, message, updated_at) as read: exactly one runner wins an item.
 * Returns false when another runner changed the row first.
 */
async function claimItem(sb: SupabaseClient, itemId: string, seenUpdatedAt: string): Promise<boolean> {
  let q = sb
    .from(JOB_ITEMS_TABLE)
    .update({ message: CLAIM_MESSAGE, updated_at: new Date().toISOString() })
    .eq("id", itemId)
    .eq("status", "pending");
  q = seenUpdatedAt ? q.eq("updated_at", seenUpdatedAt) : q.is("updated_at", null);
  const { data } = await q.select("id");
  return Boolean(data?.length);
}

/**
 * Next pending item in publish order with its due time. Items missing from `order` (older jobs)
 * go last, in arrival order. Pure.
 */
export function pickNextItem(
  pending: Record<string, unknown>[],
  params: JobParams,
  createdAt: string,
): { item: Record<string, unknown>; dueAt: number } | null {
  if (!pending.length) return null;
  const order = params.order ?? [];
  const pos = (r: Record<string, unknown>) => {
    const i = order.indexOf(`${r.source_site}|${r.source_board}|${r.source_article_key}`);
    return i < 0 ? order.length + 1 : i;
  };
  const item = [...pending].sort((a, b) => pos(a) - pos(b))[0]!;
  return { item, dueAt: itemDueAt(params.schedule, pos(item), createdAt) };
}

/** Failed items back to pending (only those), so 「실패만 재시도」 never touches done/skipped items. */
export async function retryFailedItems(sb: SupabaseClient, jobId: string): Promise<number> {
  const { data, error } = await sb
    .from(JOB_ITEMS_TABLE)
    .update({ status: "pending", message: null, updated_at: new Date().toISOString() })
    .eq("job_id", jobId)
    .eq("status", "failed")
    .select("id");
  if (error) throw new Error(error.message);
  const n = data?.length ?? 0;
  if (n) await sb.from(JOBS_TABLE).update({ status: "running", finished_at: null, locked_until: null, last_error: null }).eq("id", jobId);
  return n;
}

/** Cancel the job's pending items (done items stay published). */
export async function cancelJob(sb: SupabaseClient, jobId: string): Promise<void> {
  // Job first: a runner that leases after this sees `cancelled` and does not start (lease needs queued/running).
  const { data } = await sb
    .from(JOBS_TABLE)
    .update({ status: "cancelled", finished_at: new Date().toISOString() })
    .eq("id", jobId)
    .in("status", ["queued", "running"])
    .select("id");
  if (!data?.length) throw new Error("job_not_cancellable");
  await sb.from(JOB_ITEMS_TABLE).update({ status: "skipped", message: "cancelled", updated_at: new Date().toISOString() }).eq("job_id", jobId).eq("status", "pending");
}

/** Cron: continue every unfinished job whose next item is due (spread jobs wait for their slot). */
export async function runDueJobs(sb: SupabaseClient, opts: { budgetMs?: number } = {}): Promise<JobSummary[]> {
  const t0 = Date.now();
  const budget = opts.budgetMs ?? 40_000;
  const { data } = await sb.from(JOBS_TABLE).select("id, created_by").in("status", ["queued", "running"]).order("created_at").limit(20);
  const out: JobSummary[] = [];
  for (const r of data ?? []) {
    const left = budget - (Date.now() - t0);
    if (left < 5_000) break;
    const x = r as { id: string; created_by: string | null };
    out.push(await runJobChunk(sb, x.id, { budgetMs: left, adminUserId: x.created_by || "" }));
  }
  return out;
}
